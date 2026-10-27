export const API_BASE = "https://spotify.f8team.dev";

// Lưu dữ liệu sau khi đăng nhập / đăng ký thành công
export const saveAuthData = (data) => {
  if (data.access_token) {
    localStorage.setItem("access_token", data.access_token);
  }
  if (data.refresh_token) {
    localStorage.setItem("refresh_token", data.refresh_token);
  }
  if (data.user) {
    localStorage.setItem("user", JSON.stringify(data.user));
  }
};

// Nếu đã đăng nhập thì chuyển về trang chủ
export const redirectIfLoggedIn = () => {
  if (localStorage.getItem("access_token")) {
    location.href = "/index.html";
  }
};
