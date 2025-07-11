export async function api(
  path,
  { method = "GET", body, sessionToken, API_KEY, baseUrl } = {},
) {
  const headers = {
    "Content-Type": "application/json",
    ...(sessionToken ? { "X-Metabase-Session": sessionToken } : {}),
    ...(API_KEY ? { "X-API-KEY": API_KEY } : {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${method}] ${path} → ${res.status}: ${text}`);
  }

  if (res.status === 204) {
    return null;
  }
  return res.json();
}

export function createMetabaseClient({ baseUrl, sessionToken, API_KEY }) {
  const sharedConfig = { baseUrl, sessionToken, API_KEY };

  return {
    get: (path) => api(path, { ...sharedConfig, method: "GET" }),
    post: (path, body) => api(path, { ...sharedConfig, method: "POST", body }),
    put: (path, body) => api(path, { ...sharedConfig, method: "PUT", body }),
    delete: (path) => api(path, { ...sharedConfig, method: "DELETE" }),
    raw: (path, options = {}) => api(path, { ...sharedConfig, ...options }),
  };
}
