// Re-export all plugins from OSS modules
export * from "./oss/api";
export * from "./oss/ai";
export * from "./oss/audit";
export * from "./oss/auth";
export * from "./oss/caching";
export * from "./oss/collections";
export * from "./oss/content-translation";
export * from "./oss/content-verification";
export * from "./oss/core";
export * from "./oss/dashcard-menu";
export * from "./oss/database";
export * from "./oss/documents";
export * from "./oss/embedding";
export * from "./oss/embedding-iframe-sdk";
export * from "./oss/embedding-iframe-sdk-setup";
export * from "./oss/embedding-sdk";
export * from "./oss/entities";
export * from "./oss/model-persistence";
export * from "./oss/moderation";
export * from "./oss/permissions";
export * from "./oss/public-sharing";
export * from "./oss/remote-sync";
export * from "./oss/resource-downloads";
export * from "./oss/semantic-search";
export * from "./oss/settings";
export * from "./oss/support";
export * from "./oss/smtp-override";
export * from "./oss/transforms";
export * from "./oss/upload-management";
export * from "./oss/whitelabel";

// Re-export types that are used by other files
export type {
  GetAuthProviders,
  PluginGroupManagersType,
  SyncedCollectionsSidebarSectionProps,
} from "./types";
