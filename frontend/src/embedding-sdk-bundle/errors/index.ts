// Errors moved to embedding-sdk-shared so non-app consumers (e.g. EE auth-common)
// can import them without crossing module boundaries. Re-exported here so existing
// `embedding-sdk-bundle/errors` imports keep working.
export * from "embedding-sdk-shared/errors";
