export const BACKEND_HOST = process.env.MB_JETTY_HOST || "localhost";
export const BACKEND_PORT =
  process.env.MB_JETTY_PORT || process.env.BACKEND_PORT || 4000;
