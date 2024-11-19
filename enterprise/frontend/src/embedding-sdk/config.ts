export const DEFAULT_FONT = "Lato";
export const EMBEDDING_SDK_ROOT_ELEMENT_ID = "metabase-sdk-root";
export const EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID = "metabase-sdk-portal-root";
export const EMBEDDING_SDK_FULL_PAGE_PORTAL_ROOT_ELEMENT_ID =
  "metabase-sdk-full-page-portal-root";

export const getEmbeddingSdkVersion = (): string | "unknown" =>
  (process.env.EMBEDDING_SDK_VERSION as string) ?? "unknown";
