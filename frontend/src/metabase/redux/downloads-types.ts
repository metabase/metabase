/**
 * Types for download functionality.
 * Extracted to avoid circular dependency between downloads.ts and downloads-analytics.ts
 */

export type ResourceType =
  | "question"
  | "dashcard"
  | "document-card"
  | "ad-hoc-question";

export type ResourceAccessedVia =
  | "internal"
  | "public-link"
  | "static-embed"
  | "interactive-iframe-embed"
  | "sdk-embed";

export type DownloadedResourceInfo = {
  resourceType: ResourceType;
  accessedVia: ResourceAccessedVia;
};
