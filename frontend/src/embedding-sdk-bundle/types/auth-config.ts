// Auth config types moved to embedding-sdk-shared so non-app consumers can import
// them without crossing module boundaries. Re-exported here so existing
// `embedding-sdk-bundle/types/auth-config` imports keep working.
export type * from "embedding-sdk-shared/types/auth-config";
