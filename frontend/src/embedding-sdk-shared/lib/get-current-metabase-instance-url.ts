/** Returns the Metabase root path without trailing slashes. */
export const getMetabaseRootPath = (): string =>
  (window.MetabaseRoot ?? "/").replace(/\/+$/, "");

/** Returns the instance URL for the current window, including subpath. */
export const getCurrentMetabaseInstanceUrl = (): string =>
  `${window.location.origin}${getMetabaseRootPath()}`;
