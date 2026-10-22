export const EMBEDDED_DATA_APP_PREFIX = "/embed/embedded-apps";

/** Select embedded mode before the runtime starts, including subpath installs. */
export function isEmbeddedDataAppPath({
  pathname,
  root = "/",
}: {
  pathname: string;
  root?: string;
}): boolean {
  return pathname.startsWith(
    `${root.replace(/\/+$/, "")}${EMBEDDED_DATA_APP_PREFIX}/`,
  );
}

/** Use one relative form for both host settings and runtime URLs. */
export function normalizeDataAppPath(path: string): string {
  return path.replace(/^\/+/, "");
}

/** Return the app name from a relative app path, rejecting paths that escape it. */
export function getDataAppNameFromPath(path: string): string | undefined {
  const pathname = path
    ? normalizeDataAppPath(path).split(/[?#]/, 1)[0]
    : undefined;
  const segments = pathname?.split("/");
  const name = segments?.[0];

  // eslint-disable-next-line no-control-regex -- URLs strip control characters before resolving paths.
  const hasUnsafeCharacters = /[\\\x00-\x20]/.test(path);

  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || hasUnsafeCharacters) {
    return undefined;
  }

  try {
    for (const segment of segments) {
      const decoded = decodeURIComponent(segment);

      if (
        decoded === "." ||
        decoded === ".." ||
        // eslint-disable-next-line no-control-regex -- Reject decoded URL control characters.
        /[/\\\x00-\x20]/.test(decoded)
      ) {
        return undefined;
      }
    }
  } catch {
    return undefined;
  }

  return name;
}
