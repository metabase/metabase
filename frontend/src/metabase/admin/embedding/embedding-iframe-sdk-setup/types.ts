import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  MetabotEmbedOptions,
  QuestionEmbedOptions,
  SdkIframeEmbedAuthTypeSettings,
  SdkIframeEmbedBaseSettings,
  SdkIframeEmbedSettingKey,
} from "metabase/embedding/iframe-sdk/types/embed";
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

export type SdkIframeEmbedSetupGuestEmbedSettings =
  SdkIframeEmbedAuthTypeSettings;

export type SdkIframeDashboardEmbedSettings = DashboardEmbedOptions & {
  lockedParameters?: string[];
};

export type SdkIframeQuestionEmbedSettings = QuestionEmbedOptions & {
  lockedParameters?: string[];
};

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
  Partial<SdkIframeEmbedSetupGuestEmbedSettings> &
  SdkIframeEmbedSetupTemplateSettings;

/**
 * Setup-only variant of `SdkIframeEmbedSettingKey` that adds keys
 * specific to the admin wizard (e.g. `lockedParameters`, which is a
 * setup-time concept, not a runtime key).
 */
export type SdkIframeEmbedSetupSettingKey =
  | SdkIframeEmbedSettingKey
  | "lockedParameters";
