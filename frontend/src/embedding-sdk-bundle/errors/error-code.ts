// Error code type moved to embedding-sdk-shared so non-app consumers can import
// it without crossing module boundaries. Re-exported here so existing
// `embedding-sdk-bundle/errors/error-code` imports keep working.
export type * from "embedding-sdk-shared/errors/error-code";
