import { httpRequest } from "./libs/httpRequest.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const DEFAULT_IMAGE = "https://picsum.photos/seed/musicapp-default/300/300";
const SHELF_LIMIT = 12;

const isLoggedIn = () => !!localStorage.getItem("access_token");
const token = localStorage.getItem("access_token");

const getUser = () => {
  for (const key of ["sf_user", "user"]) {
    try {
      const user = JSON.parse(localStorage.getItem(key) || "null");
      if (user) return user;
    } catch {}
  }
  return null;
};

const clearAuth = () => {
  Object.keys(localStorage).forEach((key) => {
    if (
      ["access_token", "refresh_token", "user"].includes(key) ||
      key.startsWith("sf_")
    ) {
      localStorage.removeItem(key);
    }
  });
};

const API_MAP = {
  tracks: { path: "/api/tracks?limit=20", key: "tracks" },
  artists: { path: "/api/artists?limit=20", key: "artists" },
  albums: { path: "/api/albums?limit=20", key: "albums" },
  playlists: { path: "/api/playlists?limit=20", key: "playlists" },
};

const COLLECTION_TRACKS = {
  playlists: (id) => `/api/playlists/${id}/tracks`,
  albums: (id) => `/api/albums/${id}/tracks`,
  artists: (id) => `/api/artists/${id}/tracks/popular`,
};

const TYPE_LABEL = {
  playlists: "Playlist",
  artists: "Nghệ sĩ",
  albums: "Album",
};

const globalData = { tracks: [], artists: [], albums: [], playlists: [] };

const ICON = {
  play: `<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  playSm: `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  heart: (on) =>
    `<svg class="h-8 w-8" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/></svg>`,
  plus: `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  close: `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  search: `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  clock: `<svg class="ml-auto h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
};

const BTN_PLAY =
  "grid h-14 w-14 place-items-center rounded-full bg-[#1ed760] text-black transition hover:scale-105";
const BTN_OUTLINE =
  "rounded-full border border-[#727272] px-4 py-1.5 text-sm font-bold text-white transition hover:scale-105 hover:border-white";

// ============================================================
// 2. HELPERS
// ============================================================
const escapeHtml = (value = "") =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const formatTime = (sec) => {
  if (!sec || Number.isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const formatNumber = (n) =>
  n == null ? "0" : Number(n).toLocaleString("vi-VN");

let toastTimer = null;
const showToast = (message) => {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className =
      "fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black shadow-xl transition-opacity";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.opacity = "0"), 2500);
};

const requireAuth = () => {
  if (!isLoggedIn()) {
    location.href = "/login.html";
    return false;
  }
  return true;
};

const toHttps = (url = "") =>
  url.startsWith("http://") ? url.replace("http://", "https://") : url;

// /playlists/:id/tracks trả về track_id, track_title, track_audio_url...
const normalizeTrack = (t) => {
  if (!t) return t;
  return {
    ...t,
    id: t.track_id || t.id,
    title: t.title || t.track_title || "",
    audio_url: toHttps(t.audio_url || t.track_audio_url || ""),
    duration: t.duration ?? t.track_duration ?? 0,
    image_url: toHttps(
      t.image_url || t.track_image_url || t.album_cover_image_url || "",
    ),
    artist_name: t.artist_name || "",
  };
};
const normalizeTracks = (list) => (list || []).map(normalizeTrack);

const imgFallback = `onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';"`;

// ============================================================
// 3. GẮN HOOK VÀO index.html (không cần sửa HTML)
// ============================================================
const mainEl = $("main");

const mountAuthArea = () => {
  let el = $("#authArea");
  if (el) return el;
  const nav = $("header nav");
  if (!nav) return null;
  el = document.createElement("div");
  el.id = "authArea";
  el.className = "flex items-center";
  const links = $$('a[href="/register.html"], a[href="/login.html"]', nav);
  if (links.length) links[0].before(el);
  else nav.append(el);
  links.forEach((a) => a.remove());
  return el;
};

const mountShelf = (id, headingText) => {
  let el = $(`#${id}`);
  if (el) return el;
  const h2 = $$("main h2").find((h) => h.textContent.includes(headingText));
  const grid = h2?.closest("section")?.querySelector(":scope > div.grid");
  if (!grid) return null;
  grid.id = id;
  grid.setAttribute("aria-live", "polite");
  grid.innerHTML = "";
  return grid;
};

const mountAlbumShelf = () => {
  let el = $("#album-list");
  if (el) return el;
  const anchor = $("#playlist-list")?.closest("section");
  if (!anchor) return null;
  const section = document.createElement("section");
  section.className = "mb-10";
  section.innerHTML = `
    <div class="mb-3 flex items-end justify-between">
      <h2 class="text-2xl font-bold tracking-tight">Album nổi bật</h2>
    </div>
    <div id="album-list" aria-live="polite"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6"></div>`;
  anchor.after(section);
  return $("#album-list", section);
};

const mountLibrary = () => {
  let el = $("#library-list");
  if (!el) {
    el = $("aside ul");
    if (el) el.id = "library-list";
  }
  return el;
};

const mountVolume = () => {
  let bar = $("#volume-bar");
  if (!bar) {
    bar = $("footer .w-24");
    if (bar) bar.id = "volume-bar";
  }
  const fill = bar?.firstElementChild || null;
  if (fill) fill.id = "volume-fill";
  return { bar, fill };
};

// Vùng trang chủ + vùng chi tiết (đổi qua lại bằng hidden)
const mountViews = () => {
  let home = $("#home-view");
  if (!home && mainEl) {
    home = mainEl.firstElementChild;
    if (home) home.id = "home-view";
  }
  let detail = $("#detail-view");
  if (!detail && mainEl) {
    detail = document.createElement("div");
    detail.id = "detail-view";
    detail.className = "hidden px-6 py-6";
    mainEl.append(detail);
  }
  return { home, detail };
};

// Dropdown kết quả tìm kiếm dưới ô #search
const mountSearchDropdown = () => {
  let el = $("#search-dropdown");
  if (el) return el;
  const wrap = $("#search")?.parentElement;
  if (!wrap) return null;
  el = document.createElement("div");
  el.id = "search-dropdown";
  el.className =
    "absolute left-0 top-full z-50 mt-2 hidden max-h-[70vh] w-full overflow-y-auto rounded-lg bg-[#282828] shadow-2xl shadow-black/60";
  wrap.append(el);
  return el;
};

const authArea = mountAuthArea();
const trackListEl = $("#track-list");
const playlistListEl = mountShelf("playlist-list", "Playlist nổi bật");
const artistListEl = mountShelf("artist-list", "Nghệ sĩ phổ biến");
const albumListEl = mountAlbumShelf();
const libraryListEl = mountLibrary();
const { home: homeView, detail: detailView } = mountViews();
const searchDropdown = mountSearchDropdown();
const searchInput = $("#search");
const audio = $("#audio-player");

const CONTAINERS = {
  tracks: trackListEl,
  playlists: playlistListEl,
  albums: albumListEl,
  artists: artistListEl,
};

// ============================================================
// 4. KHU ĐĂNG KÝ / ĐĂNG NHẬP <-> AVATAR / ĐĂNG XUẤT
// ============================================================
const renderAuthArea = () => {
  if (!authArea) return;

  if (token) {
    const user = getUser();
    const letter = (user?.name || user?.email || "U")
      .trim()
      .charAt(0)
      .toUpperCase();
    const avatar = user?.avatar || user?.avatar_url;

    authArea.innerHTML = `
      <a href="/profile.html" title="Hồ sơ" class="grid h-12 w-12 place-items-center rounded-full bg-[#1f1f1f] transition hover:scale-105">
        ${
          avatar
            ? `<img src="${escapeHtml(avatar)}" alt="" class="h-8 w-8 rounded-full object-cover">`
            : `<span class="grid h-8 w-8 place-items-center rounded-full bg-[#1ed760] text-sm font-extrabold text-black">${escapeHtml(letter)}</span>`
        }
      </a>
      <button id="logout" type="button" class="ml-2 rounded-full border border-[#727272] px-4 py-2 text-sm font-bold text-white transition hover:border-white">Log out</button>`;

    $("#logout")?.addEventListener("click", () => {
      clearAuth();
      location.reload();
    });
  } else {
    authArea.innerHTML = `
      <a href="/register.html" class="px-3 transition hover:scale-105 hover:text-white">Sign up</a>
      <a href="/login.html" class="ml-2 rounded-full bg-white px-8 py-3 text-black transition hover:scale-105">Sign in</a>`;
  }
};

// ============================================================
// 5. FETCH DATA TRANG CHỦ
// ============================================================
const fetchData = async (type) => {
  const conf = API_MAP[type];
  const response = await httpRequest.get(conf.path);
  const items = response[conf.key] || response[type] || response.data || [];
  if (!Array.isArray(items)) {
    throw new Error(`API ${type} không trả về danh sách hợp lệ.`);
  }
  return items;
};

const refreshType = async (type) => {
  try {
    globalData[type] = await fetchData(type);
    renderCards(type, globalData[type]);
    renderLibrary();
  } catch (error) {
    console.error(`Không làm mới được ${type}:`, error);
  }
};

// ============================================================
// 6. RENDER CARD
// ============================================================
const toCardData = (type, item) => {
  switch (type) {
    case "albums":
      return {
        id: item.id,
        image: item.cover_image_url,
        title: item.title,
        description: item.artist_name || "Album",
      };
    case "artists":
      return {
        id: item.id,
        image: item.image_url,
        title: item.name,
        description: "Nghệ sĩ",
      };
    case "tracks":
      return {
        id: item.id,
        image: item.image_url || item.album_cover_image_url,
        title: item.title,
        description: item.artist_name || "Bài hát",
      };
    case "playlists":
      return {
        id: item.id,
        image: item.image_url,
        title: item.name,
        description:
          item.description || item.user_display_name || "Danh sách phát",
      };
    default:
      return null;
  }
};

const cardHtml = (type, raw) => {
  const item = toCardData(type, raw);
  const title = escapeHtml(item.title);
  const id = escapeHtml(item.id);
  return `
    <div class="card-item group cursor-pointer rounded-lg bg-[#181818] p-3 transition hover:bg-[#282828]" data-type="${type}" data-id="${id}">
      <div class="relative mb-3">
        <img class="aspect-square w-full object-cover shadow-lg shadow-black/40 ${type === "artists" ? "rounded-full" : "rounded-md"}"
          src="${escapeHtml(item.image || DEFAULT_IMAGE)}" alt="${title}" loading="lazy" ${imgFallback}>
        <button type="button" aria-label="Phát" data-type="${type}" data-id="${id}"
          class="play-card-btn absolute bottom-2 right-2 grid h-12 w-12 translate-y-2 place-items-center rounded-full bg-[#1ed760] text-black opacity-0 shadow-xl transition-all duration-200 hover:scale-105 group-hover:translate-y-0 group-hover:opacity-100">
          ${ICON.play}
        </button>
      </div>
      <h3 class="truncate font-bold">${title}</h3>
      <p class="line-clamp-2 text-sm text-[#b3b3b3]">${escapeHtml(item.description)}</p>
    </div>`;
};

const emptyMessage = (text) =>
  `<p class="col-span-full py-6 text-sm text-[#b3b3b3]">${text}</p>`;

const renderCards = (type, items) => {
  const parent = CONTAINERS[type];
  if (!parent) return;
  if (!items.length) {
    parent.innerHTML = emptyMessage("Không có dữ liệu.");
    return;
  }
  parent.innerHTML = items
    .slice(0, SHELF_LIMIT)
    .map((raw) => cardHtml(type, raw))
    .join("");
};

// Phát toàn bộ 1 bài / album / playlist / nghệ sĩ
const playCollection = async (type, id) => {
  if (type === "tracks") {
    const track =
      globalData.tracks.find((t) => String(t.id) === String(id)) ||
      detailTracks.find((t) => String(t.id) === String(id));
    if (track) playTrack(track, globalData.tracks);
    return;
  }
  const buildPath = COLLECTION_TRACKS[type];
  if (!buildPath) return;
  try {
    const res = await httpRequest.get(buildPath(id));
    const list = normalizeTracks(res.tracks || res.data || []);
    if (!list.length) return showToast("Mục này chưa có bài hát nào.");
    playTrack(list[0], list);
  } catch (error) {
    showToast(error.message || "Không tải được danh sách bài hát.");
  }
};

// Click thẻ -> mở chi tiết; click nút play trên thẻ -> phát
document.addEventListener("click", (event) => {
  const playBtn = event.target.closest(".play-card-btn");
  if (playBtn) {
    event.stopPropagation();
    playCollection(playBtn.dataset.type, playBtn.dataset.id);
    return;
  }
  const card = event.target.closest(".card-item, .lib-item");
  if (card?.dataset.type && card.dataset.id) {
    openDetail(card.dataset.type, card.dataset.id);
  }
});

// ============================================================
// 7. THƯ VIỆN (sidebar)
// ============================================================
let libraryTab = "artists";
const TAB_BY_TEXT = {
  Playlist: "playlists",
  "Nghệ sĩ": "artists",
  Album: "albums",
};
const tabButtons = $$("aside .flex.gap-2 button");

const paintTabs = () => {
  tabButtons.forEach((btn) => {
    const active = TAB_BY_TEXT[btn.textContent.trim()] === libraryTab;
    btn.classList.toggle("bg-white", active);
    btn.classList.toggle("text-black", active);
    btn.classList.toggle("bg-[#2a2a2a]", !active);
  });
};

function renderLibrary() {
  if (!libraryListEl) return;
  if (!token) {
    libraryListEl.innerHTML = `<li class="p-3 text-sm text-[#b3b3b3]">Đăng nhập để xem thư viện của bạn.</li>`;
    return;
  }
  const items = globalData[libraryTab] || [];
  if (!items.length) {
    libraryListEl.innerHTML = `<li class="p-3 text-sm text-[#b3b3b3]">Chưa có mục nào trong thư viện.</li>`;
    return;
  }
  libraryListEl.innerHTML = items
    .map((raw) => {
      const item = toCardData(libraryTab, raw);
      return `
      <li>
        <div class="lib-item flex cursor-pointer items-center gap-3 rounded-md p-2 transition hover:bg-[#1a1a1a]" data-type="${libraryTab}" data-id="${escapeHtml(item.id)}">
          <img class="h-12 w-12 object-cover ${libraryTab === "artists" ? "rounded-full" : "rounded"}"
            src="${escapeHtml(item.image || DEFAULT_IMAGE)}" alt="" loading="lazy" ${imgFallback}>
          <div class="min-w-0">
            <p class="truncate font-medium">${escapeHtml(item.title || TYPE_LABEL[libraryTab])}</p>
            <p class="truncate text-sm text-[#b3b3b3]">${TYPE_LABEL[libraryTab]}</p>
          </div>
        </div>
      </li>`;
    })
    .join("");
}

tabButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    const tab = TAB_BY_TEXT[btn.textContent.trim()];
    if (!tab) return;
    libraryTab = tab;
    paintTabs();
    renderLibrary();
  }),
);

// ============================================================
// 8. TẠO PLAYLIST (POST /api/playlists)
// ============================================================
async function createPlaylist() {
  if (!requireAuth()) return;
  try {
    const res = await httpRequest.post("/api/playlists", {
      name: "My playlist",
      description: "",
      is_public: true,
    });
    const pl = res.playlist || res.playlists || res.data || res;
    await refreshType("playlists");
    libraryTab = "playlists";
    paintTabs();
    renderLibrary();
    if (pl?.id) openDetail("playlists", pl.id);
  } catch (error) {
    showToast(error.message || "Không tạo được playlist.");
  }
}
$('aside [aria-label="Tạo playlist"]')?.addEventListener(
  "click",
  createPlaylist,
);

// ============================================================
// 9. TRANG CHI TIẾT
// ============================================================
let detailTracks = [];
let detailReq = 0;
let detail = null; // { type, id, entity, ...trạng thái riêng }

function showHome() {
  detailReq++;
  homeView?.classList.remove("hidden");
  if (detailView) {
    detailView.classList.add("hidden");
    detailView.innerHTML = "";
  }
  detail = null;
  detailTracks = [];
  searchDropdown?.classList.add("hidden");
  if (mainEl) mainEl.scrollTop = 0;
}

// Logo + nút Home
$$('header > a, header a[aria-label="Trang chủ"]').forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    showHome();
  }),
);

const trackRowsHtml = (tracks, { showImg = true, canRemove = false } = {}) => {
  tracks = normalizeTracks(tracks);
  detailTracks = tracks;
  if (!tracks.length) {
    return `<p class="py-4 text-sm text-[#b3b3b3]">Chưa có bài hát.</p>`;
  }
  return `
  <div class="mt-4">
    <div class="grid grid-cols-[2rem_1fr_3rem_2rem] gap-4 border-b border-[#282828] px-4 py-2 text-xs text-[#b3b3b3]">
      <span class="text-center">#</span><span>Tiêu đề</span><span class="text-right">${ICON.clock}</span><span></span>
    </div>
    ${tracks
      .map((t, i) => {
        const img = t.image_url || t.artist_image_url || DEFAULT_IMAGE;
        return `
      <div class="track-row group grid cursor-pointer grid-cols-[2rem_1fr_3rem_2rem] items-center gap-4 rounded-md px-4 py-2 hover:bg-white/10" data-id="${escapeHtml(t.id)}">
        <span class="text-center text-sm text-[#b3b3b3]">
          <span class="group-hover:hidden">${i + 1}</span>
          <span class="hidden text-white group-hover:inline">${ICON.playSm}</span>
        </span>
        <div class="flex min-w-0 items-center gap-3">
          ${showImg ? `<img src="${escapeHtml(img)}" alt="" class="h-10 w-10 rounded object-cover" ${imgFallback}>` : ""}
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-white">${escapeHtml(t.title)}</p>
            <p class="truncate text-xs text-[#b3b3b3]">${escapeHtml(t.artist_name)}</p>
          </div>
        </div>
        <span class="text-right text-xs text-[#b3b3b3]">${formatTime(t.duration)}</span>
        ${
          canRemove
            ? `<button type="button" data-action="remove-track" data-id="${escapeHtml(t.id)}" title="Xóa khỏi playlist"
                class="invisible text-[#b3b3b3] hover:text-white group-hover:visible">${ICON.close}</button>`
            : `<span></span>`
        }
      </div>`;
      })
      .join("")}
  </div>`;
};

// ---------- 9.1 Bài hát ----------
async function loadTrackDetail(id) {
  const res = await httpRequest.get(`/api/tracks/${id}`);
  const d = normalizeTrack(res.track || res.data || res);
  detailTracks = [d];
  detail = { type: "tracks", id, entity: d };

  const duration = d.duration
    ? ` • ${formatTime(d.duration).replace(":", " phút ")} giây`
    : "";
  return {
    html: `
    <div class="flex flex-col items-end gap-6 sm:flex-row">
      <img src="${escapeHtml(d.image_url || d.artist_image_url || DEFAULT_IMAGE)}" alt="" class="h-48 w-48 rounded-md object-cover shadow-2xl" ${imgFallback}>
      <div>
        <p class="text-xs font-bold uppercase">Bài hát</p>
        <h1 class="mt-1 text-4xl font-black">${escapeHtml(d.title)}</h1>
        <p class="mt-2 text-sm font-bold text-[#b3b3b3]">
          ${d.artist_id ? `<button type="button" data-action="open" data-type="artists" data-id="${escapeHtml(d.artist_id)}" class="text-white hover:underline">${escapeHtml(d.artist_name)}</button>` : escapeHtml(d.artist_name)}
          ${d.album_title ? ` • ${escapeHtml(d.album_title)}` : ""}
          ${d.created_at ? ` • ${new Date(d.created_at).getFullYear()}` : ""}${duration}
        </p>
        <div class="mt-4 flex items-center gap-4">
          <button type="button" data-action="play-all" class="${BTN_PLAY}" aria-label="Phát">${ICON.play}</button>
          <button type="button" data-action="like-track" class="${d.is_liked ? "text-[#1ed760]" : "text-[#b3b3b3]"} transition hover:scale-105" aria-label="Thích">${ICON.heart(d.is_liked)}</button>
        </div>
      </div>
    </div>`,
  };
}

// ---------- 9.2 Nghệ sĩ ----------
async function loadArtistDetail(id) {
  const [ar, albumsRes, tracksRes] = await Promise.all([
    httpRequest.get(`/api/artists/${id}`),
    httpRequest.get(`/api/artists/${id}/albums`).catch(() => ({ albums: [] })),
    httpRequest
      .get(`/api/artists/${id}/tracks/popular`)
      .catch(() => ({ tracks: [] })),
  ]);
  const a = ar.artist || ar.data || ar;
  const albums = albumsRes.albums || albumsRes.data || [];
  const tracks = tracksRes.tracks || tracksRes.data || [];
  detail = { type: "artists", id, entity: a };

  return {
    html: `
    <div class="relative -mx-6 -mt-6 mb-4 h-72 bg-cover bg-center"
      style="background-image: linear-gradient(to top, rgba(18,18,18,.9), rgba(0,0,0,.1)), url('${escapeHtml(a.background_image_url || a.image_url || DEFAULT_IMAGE)}');">
      <div class="absolute bottom-8 left-6">
        <h1 class="text-6xl font-black">${escapeHtml(a.name)}</h1>
        <p class="mt-2 text-sm font-bold">${formatNumber(a.monthly_listeners ?? a.total_followers)} người nghe hàng tháng</p>
      </div>
    </div>
    <div class="mb-5 flex items-center gap-4">
      <button type="button" data-action="play-all" class="${BTN_PLAY}" aria-label="Phát">${ICON.play}</button>
      <button type="button" data-action="follow-artist" class="${BTN_OUTLINE}">${a.is_following ? "Đang theo dõi" : "Theo dõi"}</button>
    </div>
    <h2 class="mb-2 text-2xl font-bold">Phổ biến</h2>
    ${trackRowsHtml(tracks)}
    ${
      albums.length
        ? `<h2 class="mb-3 mt-8 text-2xl font-bold">Albums</h2>
           <div class="flex gap-2 overflow-x-auto pb-2">
             ${albums.map((al) => `<div class="w-40 shrink-0">${cardHtml("albums", al)}</div>`).join("")}
           </div>`
        : ""
    }`,
  };
}

// ---------- 9.3 Album ----------
async function loadAlbumDetail(id) {
  const [al, tr] = await Promise.all([
    httpRequest.get(`/api/albums/${id}`),
    httpRequest.get(`/api/albums/${id}/tracks`).catch(() => ({ tracks: [] })),
  ]);
  const a = al.album || al.data || al;
  const tracks = tr.tracks || tr.data || [];
  detail = { type: "albums", id, entity: a };

  return {
    html: `
    <div class="flex flex-col items-end gap-6 sm:flex-row">
      <img src="${escapeHtml(a.cover_image_url || a.artist_image_url || DEFAULT_IMAGE)}" alt="" class="h-48 w-48 rounded-md object-cover shadow-2xl" ${imgFallback}>
      <div>
        <p class="text-xs font-bold uppercase">Album</p>
        <h1 class="mt-1 text-4xl font-black">${escapeHtml(a.title)}</h1>
        <p class="mt-2 text-sm text-[#b3b3b3]">
          ${escapeHtml(a.artist_name || "")}
          ${a.release_date ? `• ${escapeHtml(String(a.release_date).slice(0, 4))}` : ""}
          ${a.total_tracks != null ? `• ${a.total_tracks} bài` : ""}
        </p>
        <div class="mt-4 flex items-center gap-4">
          <button type="button" data-action="play-all" class="${BTN_PLAY}" aria-label="Phát">${ICON.play}</button>
          <button type="button" data-action="like-album" class="${a.is_liked ? "text-[#1ed760]" : "text-[#b3b3b3]"} transition hover:scale-105" aria-label="Thích">${ICON.heart(a.is_liked)}</button>
        </div>
      </div>
    </div>
    ${trackRowsHtml(tracks, { showImg: false })}`,
  };
}

// ---------- 9.4 Playlist ----------
async function loadPlaylistDetail(id) {
  const [pl, tr] = await Promise.all([
    httpRequest.get(`/api/playlists/${id}`),
    httpRequest.get(`/api/playlists/${id}/tracks`),
  ]);
  const p = pl.playlist || pl.data || pl;
  const tracks = normalizeTracks(tr.tracks || tr.data || []);
  const isOwner = !!p.is_owner;
  detail = {
    type: "playlists",
    id,
    entity: p,
    isOwner,
    existingIds: new Set(tracks.map((t) => String(t.id))),
    dirty: false,
  };

  const owner = p.user_display_name || p.user_username || "";
  return {
    html: `
    <div class="flex flex-col items-end gap-6 sm:flex-row">
      <img src="${escapeHtml(p.image_url || DEFAULT_IMAGE)}" alt="" class="h-48 w-48 rounded-md bg-[#333] object-cover shadow-2xl" ${imgFallback}>
      <div>
        <p class="text-xs font-bold uppercase">${p.is_public ? "Public" : "Private"} Playlist</p>
        <h1 class="mt-1 text-4xl font-black">${escapeHtml(p.name)}</h1>
        <p class="mt-2 text-sm text-[#b3b3b3]">${escapeHtml(owner)} • ${p.total_tracks ?? tracks.length} bài</p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" data-action="play-all" class="${BTN_PLAY}" aria-label="Phát">${ICON.play}</button>
          ${
            isOwner
              ? `<button type="button" data-action="toggle-add" class="${BTN_OUTLINE}">+ Thêm bài hát</button>
                 <button type="button" data-action="delete-playlist" class="rounded-full border border-red-500/50 px-4 py-1.5 text-sm font-bold text-red-400 transition hover:scale-105">Xóa</button>`
              : `<button type="button" data-action="follow-playlist" class="${BTN_OUTLINE}">${p.is_following ? "Đã lưu" : "Lưu vào thư viện"}</button>`
          }
        </div>
      </div>
    </div>
    ${
      isOwner
        ? `<div id="add-tracks-panel" class="mt-8 hidden rounded-lg border border-[#333] bg-[#181818] p-4">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-base font-bold">Tìm và thêm bài hát</h3>
              <button type="button" data-action="close-add" class="text-[#b3b3b3] hover:text-white" aria-label="Đóng">${ICON.close}</button>
            </div>
            <input id="add-track-search" type="search" placeholder="Tìm bài hát bạn muốn thêm"
              class="mb-3 h-11 w-full rounded-md bg-[#2a2a2a] px-4 text-sm text-white outline-none placeholder:text-[#b3b3b3] focus:ring-1 focus:ring-white">
            <div id="add-track-results" class="flex max-h-72 flex-col gap-1 overflow-y-auto"></div>
          </div>`
        : ""
    }
    ${trackRowsHtml(tracks, { canRemove: isOwner })}`,
    after: isOwner ? bindAddPanel : null,
  };
}

// ---------- 9.5 Panel thêm bài vào playlist ----------
function bindAddPanel() {
  const input = $("#add-track-search");
  const results = $("#add-track-results");
  if (!input || !results) return;
  let timer = null;

  const matchLocal = (q) =>
    globalData.tracks.filter(
      (t) =>
        t.title?.toLowerCase().includes(q) ||
        t.artist_name?.toLowerCase().includes(q),
    );

  const renderResults = (list) => {
    list = normalizeTracks(list);
    if (!list.length) {
      results.innerHTML = `<p class="py-4 text-center text-sm text-[#b3b3b3]">Không tìm thấy bài hát</p>`;
      return;
    }
    results.innerHTML = list
      .map((t) => {
        const already = detail.existingIds.has(String(t.id));
        return `
        <div class="flex items-center gap-3 rounded-md p-2 hover:bg-white/10">
          <img src="${escapeHtml(t.image_url || DEFAULT_IMAGE)}" alt="" class="h-10 w-10 shrink-0 rounded object-cover" ${imgFallback}>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">${escapeHtml(t.title)}</p>
            <p class="truncate text-xs text-[#b3b3b3]">${escapeHtml(t.artist_name)}</p>
          </div>
          ${
            already
              ? `<span class="px-2 text-xs text-[#1ed760]">Đã thêm</span>`
              : `<button type="button" data-action="add-track" data-id="${escapeHtml(t.id)}" class="shrink-0 rounded-full border border-[#727272] px-3 py-1.5 text-xs font-bold hover:border-white">Thêm</button>`
          }
        </div>`;
      })
      .join("");
  };

  const loadSuggestions = async () => {
    let list = globalData.tracks;
    if (!list.length) {
      try {
        const res = await httpRequest.get("/api/tracks?limit=20");
        list = res.tracks || [];
      } catch {}
    }
    renderResults(list);
  };

  const search = async (q) => {
    if (!q) return loadSuggestions();
    const local = matchLocal(q);
    if (local.length) renderResults(local); // hiện ngay kết quả cục bộ

    let remote = [];
    try {
      const res = await httpRequest.get(
        `/api/search/tracks?q=${encodeURIComponent(q)}&limit=20`,
      );
      remote = res.tracks || res.data || [];
    } catch {}
    if (!remote.length) {
      try {
        const res = await httpRequest.get(
          `/api/search?q=${encodeURIComponent(q)}&type=track&limit=20`,
        );
        remote = res.tracks || res.results?.tracks || res.data?.tracks || [];
      } catch {}
    }
    const merged = new Map();
    [...local, ...remote].forEach((t) => {
      const n = normalizeTrack(t);
      if (n?.id) merged.set(String(n.id), n);
    });
    renderResults([...merged.values()]);
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim().toLowerCase();
    timer = setTimeout(() => search(q), 350);
  });

  detail.loadSuggestions = loadSuggestions;
}

// ---------- 9.6 Mở chi tiết ----------
const DETAIL_LOADERS = {
  tracks: loadTrackDetail,
  artists: loadArtistDetail,
  albums: loadAlbumDetail,
  playlists: loadPlaylistDetail,
};

async function openDetail(type, id, { silent = false } = {}) {
  const loader = DETAIL_LOADERS[type];
  if (!loader || !id || !detailView) return;

  const reqId = ++detailReq;
  homeView?.classList.add("hidden");
  detailView.classList.remove("hidden");
  searchDropdown?.classList.add("hidden");
  if (!silent) {
    detailView.innerHTML = `<div class="py-20 text-center text-[#b3b3b3]">Đang tải...</div>`;
    if (mainEl) mainEl.scrollTop = 0;
  }

  try {
    const { html, after } = await loader(id);
    if (reqId !== detailReq) return; // đã chuyển sang trang khác
    detailView.innerHTML = html;
    after?.();
  } catch (error) {
    if (reqId !== detailReq) return;
    console.error("Lỗi mở chi tiết:", error);
    detailView.innerHTML = `
      <div class="py-20 text-center text-[#b3b3b3]">
        <p class="mb-4">${escapeHtml(error.message || "Không tải được nội dung.")}</p>
        <button type="button" data-action="back" class="${BTN_OUTLINE}">Về trang chủ</button>
      </div>`;
  }
}

// ---------- 9.7 Xử lý thao tác trong trang chi tiết ----------
// Bật/tắt like hoặc follow: đang bật -> DELETE, đang tắt -> POST
const toggleRelation = async (path, active) => {
  if (!requireAuth()) return false;
  try {
    if (active) await httpRequest.delete(path);
    else await httpRequest.post(path, {});
    return true;
  } catch (error) {
    showToast(error.message || "Có lỗi xảy ra.");
    return false;
  }
};

const reloadDetail = () =>
  detail && openDetail(detail.type, detail.id, { silent: true });

const ACTIONS = {
  back: () => showHome(),

  open: (el) => openDetail(el.dataset.type, el.dataset.id),

  "play-all": () => {
    if (detailTracks[0]) playTrack(detailTracks[0], detailTracks);
    else showToast("Chưa có bài hát để phát.");
  },

  "like-track": async () => {
    const { id, entity } = detail;
    if (await toggleRelation(`/api/tracks/${id}/like`, entity.is_liked))
      reloadDetail();
  },

  "like-album": async () => {
    const { id, entity } = detail;
    if (await toggleRelation(`/api/albums/${id}/like`, entity.is_liked))
      reloadDetail();
  },

  "follow-artist": async () => {
    const { id, entity } = detail;
    if (await toggleRelation(`/api/artists/${id}/follow`, entity.is_following))
      reloadDetail();
  },

  "follow-playlist": async () => {
    const { id, entity } = detail;
    if (
      await toggleRelation(`/api/playlists/${id}/follow`, entity.is_following)
    ) {
      reloadDetail();
      refreshType("playlists");
    }
  },

  "delete-playlist": async () => {
    if (!confirm("Xóa playlist này?")) return;
    try {
      await httpRequest.delete(`/api/playlists/${detail.id}`);
      showHome();
      refreshType("playlists");
      showToast("Đã xóa playlist.");
    } catch (error) {
      showToast(error.message || "Không xóa được playlist.");
    }
  },

  "toggle-add": () => {
    const panel = $("#add-tracks-panel");
    if (!panel) return;
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      $("#add-track-search")?.focus();
      detail.loadSuggestions?.();
    }
  },

  "close-add": () => {
    $("#add-tracks-panel")?.classList.add("hidden");
    if (detail?.dirty) reloadDetail(); // có thêm bài -> làm mới danh sách
  },

  "add-track": async (el) => {
    const trackId = el.dataset.id;
    el.disabled = true;
    el.textContent = "...";
    try {
      await httpRequest.post(`/api/playlists/${detail.id}/tracks`, {
        track_id: trackId,
        position: 0,
      });
      detail.existingIds.add(String(trackId));
      detail.dirty = true;
      el.outerHTML = `<span class="px-2 text-xs text-[#1ed760]">Đã thêm</span>`;
    } catch (error) {
      el.disabled = false;
      el.textContent = "Thêm";
      showToast(error.message || "Không thêm được bài hát.");
    }
  },

  "remove-track": async (el) => {
    const trackId = el.dataset.id;
    const track = detailTracks.find((t) => String(t.id) === trackId);
    if (!confirm(`Xóa "${track?.title || "bài hát này"}" khỏi playlist?`))
      return;
    try {
      await httpRequest.delete(`/api/playlists/${detail.id}/tracks/${trackId}`);
      reloadDetail();
    } catch (error) {
      showToast(error.message || "Không xóa được bài hát.");
    }
  },
};

detailView?.addEventListener("click", async (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (actionEl) {
    event.stopPropagation();
    await ACTIONS[actionEl.dataset.action]?.(actionEl);
    return;
  }
  const row = event.target.closest(".track-row");
  if (row) {
    const track = detailTracks.find((t) => String(t.id) === row.dataset.id);
    if (track) playTrack(track, detailTracks);
  }
});

// ============================================================
// 10. TÌM KIẾM (API + dự phòng lọc cục bộ)
// ============================================================
const SEARCH_LABEL = {
  tracks: "Bài hát",
  artists: "Nghệ sĩ",
  albums: "Album",
  playlists: "Playlist",
};

const mapSearchItem = (it, type) => {
  const info = it.additional_info || {};
  return {
    id: it.id,
    name: it.title || it.name || "",
    subtitle: it.subtitle || info.artist_name || SEARCH_LABEL[type],
    image:
      it.image_url || it.cover_image_url || info.image_url || DEFAULT_IMAGE,
  };
};

const searchSection = (title, items, type) => {
  if (!items?.length) return "";
  return `
  <div class="p-2">
    <p class="mb-1 px-2 text-xs font-bold text-[#b3b3b3]">${title}</p>
    ${items
      .slice(0, 6)
      .map((raw) => {
        const it = mapSearchItem(raw, type);
        return `
        <button type="button" class="search-result flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-[#3e3e3e]" data-type="${type}" data-id="${escapeHtml(it.id)}">
          <img src="${escapeHtml(it.image)}" alt="" class="h-10 w-10 shrink-0 object-cover ${type === "artists" ? "rounded-full" : "rounded"}" ${imgFallback}>
          <div class="min-w-0">
            <p class="truncate text-sm">${escapeHtml(it.name)}</p>
            <p class="truncate text-xs text-[#b3b3b3]">${escapeHtml(it.subtitle)}</p>
          </div>
        </button>`;
      })
      .join("")}
  </div>`;
};

const localSearch = (q) => {
  const kw = q.toLowerCase();
  const has = (v) =>
    String(v || "")
      .toLowerCase()
      .includes(kw);
  return {
    tracks: globalData.tracks
      .filter((t) => has(t.title) || has(t.artist_name))
      .map((t) => ({
        id: t.id,
        title: t.title,
        subtitle: t.artist_name || "Bài hát",
        image_url: t.image_url || t.album_cover_image_url,
      })),
    artists: globalData.artists
      .filter((a) => has(a.name))
      .map((a) => ({
        id: a.id,
        title: a.name,
        subtitle: "Nghệ sĩ",
        image_url: a.image_url,
      })),
    albums: globalData.albums
      .filter((a) => has(a.title) || has(a.artist_name))
      .map((a) => ({
        id: a.id,
        title: a.title,
        subtitle: a.artist_name || "Album",
        image_url: a.cover_image_url,
      })),
    playlists: globalData.playlists
      .filter((p) => has(p.name))
      .map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: p.user_display_name || "Playlist",
        image_url: p.image_url,
      })),
  };
};

let searchSeq = 0; // bỏ qua kết quả cũ khi gõ nhanh

const showTrending = async () => {
  if (!searchDropdown) return;
  const seq = ++searchSeq;
  searchDropdown.innerHTML = `<p class="p-4 text-sm text-[#b3b3b3]">Đang tải gợi ý...</p>`;
  searchDropdown.classList.remove("hidden");
  try {
    const res = await httpRequest.get("/api/search/trending?limit=10");
    if (seq !== searchSeq) return;
    const list = res.trending_searches || [];
    searchDropdown.innerHTML = list.length
      ? `<div class="p-3">
           <p class="mb-2 text-xs font-bold text-[#b3b3b3]">Thịnh hành</p>
           ${list
             .map((item) => {
               const text =
                 typeof item === "string"
                   ? item
                   : item.query || item.keyword || "";
               return `<button type="button" class="trending-item flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-[#3a3a3a]" data-q="${escapeHtml(text)}">
                 <span class="text-[#b3b3b3]">${ICON.search}</span>${escapeHtml(text)}</button>`;
             })
             .join("")}
         </div>`
      : `<p class="p-4 text-sm text-[#b3b3b3]">Không có gợi ý</p>`;
  } catch (error) {
    if (seq !== searchSeq) return;
    console.error("Lỗi trending:", error);
    searchDropdown.innerHTML = `<p class="p-4 text-sm text-[#b3b3b3]">Không tải được gợi ý</p>`;
  }
};

const doSearch = async (q) => {
  if (!searchDropdown) return;
  if (!q) return showTrending();

  const seq = ++searchSeq;
  searchDropdown.innerHTML = `<p class="p-4 text-sm text-[#b3b3b3]">Đang tìm “${escapeHtml(q)}”...</p>`;
  searchDropdown.classList.remove("hidden");

  let found = { tracks: [], artists: [], albums: [], playlists: [] };
  try {
    const res = await httpRequest.get(
      `/api/search?q=${encodeURIComponent(q)}&type=all&limit=10`,
    );
    const bag = res.results || res.data || res;
    found = {
      tracks: bag.tracks || res.tracks || [],
      artists: bag.artists || res.artists || [],
      albums: bag.albums || res.albums || [],
      playlists: bag.playlists || res.playlists || [],
    };
  } catch (error) {
    console.error("Lỗi search API:", error);
  }
  if (seq !== searchSeq) return;

  if (!Object.values(found).some((list) => list.length)) {
    found = localSearch(q); // API rỗng/lỗi -> lọc trên dữ liệu đã tải
  }

  const html =
    searchSection("Bài hát", found.tracks, "tracks") +
    searchSection("Nghệ sĩ", found.artists, "artists") +
    searchSection("Album", found.albums, "albums") +
    searchSection("Playlist", found.playlists, "playlists");

  searchDropdown.innerHTML =
    html ||
    `<p class="p-4 text-sm text-[#b3b3b3]">Không tìm thấy kết quả cho “${escapeHtml(q)}”</p>`;
};

if (searchInput && searchDropdown) {
  let searchTimer = null;

  searchInput.addEventListener("focus", () =>
    doSearch(searchInput.value.trim()),
  );
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(searchInput.value.trim()), 300);
  });

  searchDropdown.addEventListener("click", (event) => {
    event.stopPropagation();
    const result = event.target.closest(".search-result");
    if (result) {
      searchDropdown.classList.add("hidden");
      openDetail(result.dataset.type, result.dataset.id);
      return;
    }
    const trend = event.target.closest(".trending-item");
    if (trend) {
      searchInput.value = trend.dataset.q || "";
      doSearch(searchInput.value.trim());
    }
  });

  document.addEventListener("click", (event) => {
    if (
      !searchDropdown.contains(event.target) &&
      event.target !== searchInput
    ) {
      searchDropdown.classList.add("hidden");
    }
  });
}

// Phím tắt Ctrl + Shift + L để focus ô tìm kiếm
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    searchInput?.focus();
    searchInput?.select();
  }
});

// ============================================================
// 11. TRÌNH PHÁT NHẠC
// ============================================================
let playQueue = [];
let queueIndex = -1;
let shuffleOn = false;
let repeatMode = "off"; // off -> all -> one

const iconPlay = $("#iconPlay");
const iconPause = $("#iconPause");
const progressBar = $("#progress-bar");
const progressFill = $("#progress-fill");
const { bar: volumeBar, fill: volumeFill } = mountVolume();
const shuffleBtn = $('[aria-label="Ngẫu nhiên"]');
const repeatBtn = $('[aria-label="Lặp lại"]');

function playTrack(track, list = null) {
  track = normalizeTrack(track);

  if (!track?.audio_url || !audio) {
    showToast("Bài hát này chưa có file âm thanh.");
    return;
  }

  if (list) {
    playQueue = normalizeTracks(list);
    queueIndex = playQueue.findIndex((t) => String(t.id) === String(track.id));
  }

  audio.src = track.audio_url;
  audio.play().catch((err) => {
    if (err?.name !== "AbortError") showToast("Không phát được bài hát này.");
  });

  const cover = $("#player-cover");
  if (cover) {
    cover.src = track.image_url || DEFAULT_IMAGE;
    cover.onerror = () => {
      cover.onerror = null;
      cover.src = DEFAULT_IMAGE;
    };
  }
  const title = $("#player-title");
  if (title) title.textContent = track.title;
  const artist = $("#player-artist");
  if (artist) artist.textContent = track.artist_name;
  const total = $("#time-total");
  if (total) total.textContent = formatTime(track.duration);
  if (progressFill) progressFill.style.width = "0%";
}

const playByOffset = (offset, auto = false) => {
  if (!playQueue.length) return;

  if (shuffleOn && playQueue.length > 1) {
    let next;
    do {
      next = Math.floor(Math.random() * playQueue.length);
    } while (next === queueIndex);
    queueIndex = next;
  } else {
    const next = queueIndex + offset;
    if (auto && next >= playQueue.length && repeatMode === "off") return;
    queueIndex = (next + playQueue.length) % playQueue.length;
  }
  playTrack(playQueue[queueIndex]);
};

$("#nextBtn")?.addEventListener("click", () => playByOffset(1));
$("#prevBtn")?.addEventListener("click", () => {
  if (audio && audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  playByOffset(-1);
});

$("#playBtn")?.addEventListener("click", () => {
  if (!audio?.src) return showToast("Hãy chọn một bài hát để phát.");
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
});

shuffleBtn?.addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  shuffleBtn.style.color = shuffleOn ? "#1ed760" : "";
});

repeatBtn?.addEventListener("click", () => {
  repeatMode =
    repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
  repeatBtn.style.color = repeatMode === "off" ? "" : "#1ed760";
  repeatBtn.title = { off: "Tắt lặp", all: "Lặp tất cả", one: "Lặp 1 bài" }[
    repeatMode
  ];
});

audio?.addEventListener("play", () => {
  iconPlay?.classList.add("hidden");
  iconPause?.classList.remove("hidden");
});
audio?.addEventListener("pause", () => {
  iconPlay?.classList.remove("hidden");
  iconPause?.classList.add("hidden");
});
audio?.addEventListener("loadedmetadata", () => {
  const total = $("#time-total");
  if (total) total.textContent = formatTime(audio.duration);
});
audio?.addEventListener("timeupdate", () => {
  const current = $("#time-current");
  if (current) current.textContent = formatTime(audio.currentTime);
  if (progressFill && audio.duration) {
    progressFill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
  }
});
audio?.addEventListener("ended", () => {
  if (repeatMode === "one") {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  playByOffset(1, true);
});

// Thanh tiến trình & âm lượng: click hoặc kéo
const bindSlider = (bar, onChange) => {
  if (!bar) return;
  const ratioOf = (e) => {
    const rect = bar.getBoundingClientRect();
    return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  };
  bar.addEventListener("pointerdown", (e) => {
    bar.setPointerCapture(e.pointerId);
    onChange(ratioOf(e));
    const move = (ev) => onChange(ratioOf(ev));
    const up = () => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  });
};

bindSlider(progressBar, (ratio) => {
  if (audio?.duration) audio.currentTime = ratio * audio.duration;
});

if (audio) audio.volume = 0.66;
bindSlider(volumeBar, (ratio) => {
  if (audio) audio.volume = ratio;
  if (volumeFill) volumeFill.style.width = `${ratio * 100}%`;
});

// ============================================================
// 12. KHỞI TẠO
// ============================================================
const initApp = async () => {
  renderAuthArea();
  paintTabs();
  renderLibrary();

  Object.values(CONTAINERS).forEach((el) => {
    if (el) el.innerHTML = emptyMessage("Đang tải...");
  });

  const types = ["tracks", "playlists", "albums", "artists"];
  const results = await Promise.allSettled(types.map(fetchData));

  types.forEach((type, i) => {
    const result = results[i];
    if (result.status === "fulfilled") {
      globalData[type] = result.value;
      renderCards(type, result.value);
      return;
    }
    console.error(`Lỗi khi lấy dữ liệu ${type}:`, result.reason);
    const parent = CONTAINERS[type];
    if (parent) {
      parent.innerHTML = emptyMessage(
        "Không tải được dữ liệu. Vui lòng thử lại sau.",
      );
    }
  });

  renderLibrary();

  // httpRequest.js tự xóa token khi refresh thất bại -> báo hết phiên cho login.html
  if (token && !localStorage.getItem("access_token")) {
    clearAuth();
    location.href = "/login.html?expired=1";
  }
};

initApp();
