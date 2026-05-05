import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  MetabotEmbedOptions,
  QuestionEmbedOptions,
  SdkIframeEmbedAuthTypeSettings,
  SdkIframeEmbedBaseSettings,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import type { BaseRecentItem } from "metabase-types/api";

/**
 * Wizard-scoped theme: either an inline MetabaseTheme or a reference to a
 * saved EmbeddingTheme via `id`. The preview resolves `id` back to an inline
 * theme before handing it to embed.js.
 */
export type SdkIframeEmbedSetupTheme = MetabaseTheme & { id?: number };

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
  "instanceUrl" | "theme"
> & {
  theme?: SdkIframeEmbedSetupTheme;
} & Partial<SdkIframeEmbedSetupGuestEmbedSettings> &
  SdkIframeEmbedSetupTemplateSettings;
