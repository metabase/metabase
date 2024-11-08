export const DEFAULT_FONT = "Lato";
export const EMBEDDING_SDK_ROOT_ELEMENT_ID = "metabase-sdk-root";
export const EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID = "metabase-sdk-portal-root";
export const EMBEDDING_SDK_FULL_PAGE_PORTAL_ROOT_ELEMENT_ID =
  "metabase-sdk-full-page-portal-root";

export const getEmbeddingSdkVersion = () =>
  process.env.EMBEDDING_SDK_VERSION ?? "unknown";

/** Floating elements are typically appended to a portal root. Normally it's
 * the <body>. In the SDK, it's a custom element. */
export const getPortalRootElement = () =>
  document.getElementById(EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID) ||
  document.body;
