import { getMetabaseRootPath } from "./get-current-metabase-instance-url";

export const EMBEDDED_DATA_APP_PREFIX = "/embed/embedded-apps";

export const isEmbeddedDataAppPath = (pathname: string): boolean =>
  pathname.startsWith(`${getMetabaseRootPath()}${EMBEDDED_DATA_APP_PREFIX}/`);

/**
 * Reads the app name from the `path` prop.
 *
 * The path is provided from `<metabase-data-app>` web component
 * and `DataApp` SDK component, not the browser's real url.
 */
export function getEmbeddedAppNameFromPath(path: string): string | undefined {
  const [pathname = ""] = path.replace(/^\/+/, "").split(/[?#]/, 1);

  const segments = pathname.split("/");
  const [name] = segments;

  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || hasUnsafeCharacters(path)) {
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

  return name;
}

const hasUnsafeCharacters = (path: string): boolean =>
  // eslint-disable-next-line no-control-regex -- reject backslashes, ASCII control characters and spaces.
  /[\\\x00-\x20]/.test(path);
