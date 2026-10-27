const baseUrl =
  import.meta.env.VITE_API_BASE_URL || "https://spotify.f8team.dev";

const getAuthHeaders = () => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Lấy access_token / refresh_token từ nhiều dạng response:
 * - { access_token, refresh_token }
 * - { tokens: { access_token, refresh_token } }
 * - { data: { access_token, ... } }
 * - { data: { tokens: { ... } } }
 */
export const extractTokens = (response) => {
  if (!response || typeof response !== "object") {
    return { access_token: null, refresh_token: null };
  }

  const tokensObj =
    response.tokens || response.data?.tokens || response.data || response;

  return {
    access_token: tokensObj.access_token || response.access_token || null,
    refresh_token: tokensObj.refresh_token || response.refresh_token || null,
  };
};

/**
 * Refresh access token.
 * POST /api/auth/refresh-token
 * Header: Authorization: Bearer <refresh_token | access_token>
 */
export const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem("refresh_token");
  const accessToken = localStorage.getItem("access_token");
  const tokenToSend = refreshToken || accessToken;

  if (!tokenToSend) {
    throw new Error("No refresh token available");
  }

  const response = await fetch(`${baseUrl}/api/auth/refresh-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenToSend}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    throw new Error(
      data.message || data.error?.message || "Refresh token failed",
    );
  }

  const { access_token: newAccessToken, refresh_token: newRefreshToken } =
    extractTokens(data);

  if (!newAccessToken) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    throw new Error("No access_token in refresh response");
  }

  localStorage.setItem("access_token", newAccessToken);
  if (newRefreshToken) {
    localStorage.setItem("refresh_token", newRefreshToken);
  }

  return {
    access_token: newAccessToken,
    refresh_token: newRefreshToken || refreshToken,
  };
};

/** Queue tránh gọi refresh đồng thời */
let isRefreshing = false;
let refreshPromise = null;

const fetchWithAuth = async (url, options = {}, retry = true) => {
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers,
  });

  // 401 → thử refresh rồi retry 1 lần
  if (response.status === 401 && retry) {
    const hasToken =
      !!localStorage.getItem("refresh_token") ||
      !!localStorage.getItem("access_token");

    if (!hasToken) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || data.error?.message || "Unauthorized");
    }

    try {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken().finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return fetchWithAuth(url, options, false);
    } catch (refreshError) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      throw refreshError;
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message ||
        data.error?.message ||
        `HTTP error! status: ${response.status}`,
    );
  }

  return data;
};

export const httpRequest = {
  get: async (url, options = {}) => {
    try {
      return await fetchWithAuth(url, { method: "GET", ...options });
    } catch (error) {
      console.error("GET Error:", error);
      throw error;
    }
  },

  post: async (path, data, options = {}) => {
    try {
      const isFormData = data instanceof FormData;
      const headers = { ...options.headers };

      if (!isFormData) {
        headers["Content-Type"] = "application/json";
      }

      return await fetchWithAuth(path, {
        method: "POST",
        headers,
        body: isFormData ? data : JSON.stringify(data),
        ...options,
      });
    } catch (err) {
      console.error("POST Error:", err);
      throw err;
    }
  },

  put: async (path, data, options = {}) => {
    try {
      const isFormData = data instanceof FormData;
      const headers = { ...options.headers };

      if (!isFormData) {
        headers["Content-Type"] = "application/json";
      }

      return await fetchWithAuth(path, {
        method: "PUT",
        headers,
        body: isFormData ? data : JSON.stringify(data),
        ...options,
      });
    } catch (err) {
      console.error("PUT Error:", err);
      throw err;
    }
  },

  delete: async (path, options = {}) => {
    try {
      return await fetchWithAuth(path, { method: "DELETE", ...options });
    } catch (err) {
      console.error("DELETE Error:", err);
      throw err;
    }
  },
};

// Hàm helper dùng chung để tạo thẻ i mới đúng chuẩn fontawesome + tailwind
export const createNewIcon = (iconClass, id) => {
  const newI = document.createElement("i");
  newI.id = id;
  newI.className = iconClass;
  return newI;
};
