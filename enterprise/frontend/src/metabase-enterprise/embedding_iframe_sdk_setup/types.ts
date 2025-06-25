import type { BaseRecentItem } from "metabase-types/api";

export type SdkIframeEmbedSetupExperience =
  | "dashboard"
  | "chart"
  | "exploration";

export type SdkIframeEmbedSetupStep =
  | "select-embed-experience"
  | "select-embed-entity"
  | "select-embed-options"
  | "get-code";

export type SdkIframeEmbedSetupRecentItem = Pick<
  BaseRecentItem,
  "name" | "description"
> & { id: string | number };

export type SdkIframeEmbedSetupAuthType = "user-session" | "sso";
