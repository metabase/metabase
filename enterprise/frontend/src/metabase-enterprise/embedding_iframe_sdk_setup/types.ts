import type { SdkDashboardId, SdkQuestionId } from "embedding-sdk-bundle/types";
import type {
  SdkIframeEmbedBaseSettings,
  SdkIframeEmbedStaticEmbeddingSettings,
  SdkIframeEmbedTemplateSettings,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";
import type { SdkIframeEmbedSetupStaticEmbeddingType } from "metabase-enterprise/embedding_iframe_sdk_setup/enums";
import type { BaseRecentItem } from "metabase-types/api";

export type SdkIframeEmbedSetupExperience =
  | "dashboard"
  | "chart"
  | "exploration"
  | "browser";

export type SdkIframeEmbedSetupStep =
  | "select-embed-experience"
  | "select-embed-resource"
  | "select-embed-options"
  | "get-code";

export type SdkIframeEmbedSetupRecentItemType =
  | "dashboard"
  | "question"
  | "collection";

export type SdkIframeEmbedSetupRecentItem = Pick<
  BaseRecentItem,
  "name" | "description"
> & { id: string | number };

export type SdkIframeEmbedSetupStaticEmbeddingSettings =
  SdkIframeEmbedStaticEmbeddingSettings & {
    staticEmbeddingType: SdkIframeEmbedSetupStaticEmbeddingType;
  };

/**
 * Settings used by the embed setup route.
 * Excludes `instanceUrl` as it is derived dynamically from site-url.
 */
export type SdkIframeEmbedSetupSettings = Omit<
  SdkIframeEmbedBaseSettings,
  "instanceUrl"
> &
  Partial<SdkIframeEmbedSetupStaticEmbeddingSettings> &
  SdkIframeEmbedTemplateSettings;

export type SdkIframeEmbedSetupEmbeddingType = "simple" | "static";

export type SdkIframeEmbedSetupStartWith = {
  embeddingType: SdkIframeEmbedSetupEmbeddingType;
  step: SdkIframeEmbedSetupStep;
  resourceType: SdkIframeEmbedSetupExperience;
  resourceId: SdkDashboardId | SdkQuestionId;
};
