import type {
  SdkDashboardId,
  SdkQuestionId,
  SqlParameterValues,
} from "embedding-sdk-bundle/types";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  QuestionEmbedOptions,
  SdkIframeEmbedBaseSettings,
  SdkIframeEmbedStaticEmbeddingSettings,
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

export type SdkIframeDashboardEmbedSettings = Omit<
  DashboardEmbedOptions,
  "initialParameters"
> & {
  parameters?: ParameterValues;
};

export type SdkIframeQuestionEmbedSettings = Omit<
  QuestionEmbedOptions,
  "initialSqlParameters"
> & {
  sqlParameters?: SqlParameterValues;
};

export type SdkIframeEmbedSetupTemplateSettings =
  | SdkIframeDashboardEmbedSettings
  | SdkIframeQuestionEmbedSettings
  | ExplorationEmbedOptions
  | BrowserEmbedOptions;

/**
 * Settings used by the embed setup route.
 * Excludes `instanceUrl` as it is derived dynamically from site-url.
 */
export type SdkIframeEmbedSetupSettings = Omit<
  SdkIframeEmbedBaseSettings,
  "instanceUrl"
> &
  Partial<SdkIframeEmbedSetupStaticEmbeddingSettings> &
  SdkIframeEmbedSetupTemplateSettings;

export type SdkIframeEmbedSetupEmbeddingType = "simple" | "static";

export type SdkIframeEmbedSetupStartWith = {
  embeddingType: SdkIframeEmbedSetupEmbeddingType;
  step: SdkIframeEmbedSetupStep;
  resourceType: SdkIframeEmbedSetupExperience;
  resourceId: SdkDashboardId | SdkQuestionId;
};
