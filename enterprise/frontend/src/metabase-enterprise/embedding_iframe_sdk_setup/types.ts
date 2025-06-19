import type { BaseRecentItem } from "metabase-types/api";

export type SdkIframeEmbedSetupType = "dashboard" | "chart" | "exploration";

export type SdkIframeEmbedSetupStep =
  | "select-embed-type"
  | "select-entity"
  | "configure"
  | "get-code";

export type SdkIframeEmbedSetupRecentItem = Pick<
  BaseRecentItem,
  "name" | "description"
> & { id: string | number };
