import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  MetabotEmbedOptions,
  QuestionEmbedOptions,
  SdkIframeEmbedAuthTypeSettings,
  SdkIframeEmbedBaseSettings,
} from "metabase/embedding/embedding-iframe-sdk/script/types/embed";
import type {
  BaseRecentItem,
  SdkIframeEmbedSetupTheme,
} from "metabase-types/api";

export type { SdkIframeEmbedSetupTheme } from "metabase-types/api";

export type { SdkIframeEmbedSetupExperience } from "metabase/plugins/oss/embedding-iframe-sdk-setup";

export type SdkIframeEmbedSetupStep =
  | "select-embed-experience"
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
  "instanceUrl" | "theme"
> & {
  theme?: SdkIframeEmbedSetupTheme;
} & Partial<SdkIframeEmbedSetupGuestEmbedSettings> &
  SdkIframeEmbedSetupTemplateSettings;
