import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  MetabotEmbedOptions,
  QuestionEmbedOptions,
  SdkIframeEmbedBaseSettings,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";
import type { BaseRecentItem } from "metabase-types/api";

export type SdkIframeEmbedSetupExperience =
  | "dashboard"
  | "chart"
  | "exploration"
  | "browser"
  | "metabot";

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

export type SdkIframeDashboardEmbedSettings = DashboardEmbedOptions;

export type SdkIframeQuestionEmbedSettings = QuestionEmbedOptions;

export type SdkIframeEmbedSetupTemplateSettings =
  | SdkIframeDashboardEmbedSettings
  | SdkIframeQuestionEmbedSettings
  | ExplorationEmbedOptions
  | BrowserEmbedOptions
  | MetabotEmbedOptions;

/**
 * Settings used by the embed setup route.
 * Excludes `instanceUrl` as it is derived dynamically from site-url.
 */
export type SdkIframeEmbedSetupSettings = Omit<
  SdkIframeEmbedBaseSettings,
  "instanceUrl"
> &
  SdkIframeEmbedSetupTemplateSettings;
