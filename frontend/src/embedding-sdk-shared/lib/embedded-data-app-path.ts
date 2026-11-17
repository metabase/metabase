import { getMetabaseRootPath } from "./get-current-metabase-instance-url";

export const EMBEDDED_DATA_APP_PREFIX = "/embed/embedded-apps";

export const isEmbeddedDataAppPath = (pathname: string): boolean =>
  pathname.startsWith(`${getMetabaseRootPath()}${EMBEDDED_DATA_APP_PREFIX}/`);

/**
 * Reads the app slug from the `path` prop.
 *
 * The path is provided from `<metabase-data-app>` web component
 * and `DataApp` SDK component, not the browser's real url.
 */
export function getEmbeddedAppSlugFromPath(path: string): string | undefined {
  const [pathname = ""] = path.replace(/^\/+/, "").split(/[?#]/, 1);

  const segments = pathname.split("/");
  const [slug] = segments;

  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug) || hasUnsafeCharacters(path)) {
    return undefined;
  }

  try {
    for (const segment of segments) {
      const decoded = decodeURIComponent(segment);

      if (
        decoded === "." ||
        decoded === ".." ||
        decoded.includes("/") ||
        hasUnsafeCharacters(decoded)
      ) {
        return undefined;
      }
    }
  } catch {
    return undefined;
  }

  return slug;
}

const hasUnsafeCharacters = (value: string): boolean =>
  // eslint-disable-next-line no-control-regex -- Reject backslashes and ASCII control characters.
  /[\\\x00-\x1f\x7f]/.test(value);

/** Use one relative path for host settings and runtime URLs. */
export const normalizeDataAppPath = (path: string): string =>
  path.replace(/^\/+/, "");

/** Reject invalid app names and unsafe routes. */
export function validateDataAppPath(path: string): void {
  if (!getEmbeddedAppSlugFromPath(path)) {
    throw new Error("A valid data app path must be provided.");
  }
}

/** Build the runtime URL from a validated path. */
export const getDataAppEmbedUrl = (instanceUrl: string, path: string): URL =>
  new URL(
    `${instanceUrl.replace(/\/+$/, "")}${EMBEDDED_DATA_APP_PREFIX}/${normalizeDataAppPath(path)}`,
  );
