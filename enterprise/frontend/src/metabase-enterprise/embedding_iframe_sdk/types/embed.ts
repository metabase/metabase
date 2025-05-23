import type { Query } from "history";

import type {
  EntityTypeFilterKeys,
  MetabaseTheme,
  SqlParameterValues,
} from "embedding-sdk";
import type { CollectionId } from "metabase-types/api";

/** Events that the embed.js script listens for */
export type SdkIframeEmbedTagMessage = {
  type: "metabase.embed.iframeReady";
};

/** Events that the sdk embed route listens for */
export type SdkIframeEmbedMessage = {
  type: "metabase.embed.setSettings";
  data: SdkIframeEmbedSettings;
};

/** Template to use for the embedded question or dashboard. Will be expanded in the future. */
export type SdkIframeEmbedTemplate = "exploration" | "curation";

// --- Embed Option Interfaces ---

export interface DashboardEmbedOptions {
  dashboardId: number | string;

  drillThroughEnabled?: boolean;
  withTitle?: boolean;
  withDownloads?: boolean;

  // parameters
  initialParameters?: Query;
  hiddenParameters?: string[];

  // incompatible options
  template?: never;
  questionId?: never;
}

export interface QuestionEmbedOptions {
  questionId: number | string;

  drillThroughEnabled?: boolean;
  withTitle?: boolean;
  withDownloads?: boolean;

  // parameters
  initialSqlParameters?: SqlParameterValues;

  // incompatible options
  template?: never;
  dashboardId?: never;
}

export interface ExplorationEmbedOptions {
  template: "exploration";

  isSaveEnabled?: boolean;
  targetCollection?: CollectionId;
  entityTypes?: EntityTypeFilterKeys[];

  // incompatible options
  questionId: never;
  dashboardId: never;
}

export interface CurationEmbedOptions {
  template: "curation";
  collectionId: CollectionId;

  isReadOnly?: boolean;
  entityTypes?: CollectionBrowserEntityTypes[];

  questionId?: never;
  dashboardId?: never;
}

type CollectionBrowserEntityTypes =
  | "collection"
  | "dashboard"
  | "question"
  | "model";

type SdkIframeEmbedBaseSettings = {
  apiKey: string;
  instanceUrl: string;
  theme?: MetabaseTheme;
  locale?: string;

  // Whether the embed is running on localhost. Cannot be set by the user.
  _isLocalhost?: boolean;
};

type SdkIframeEmbedTemplateSettings =
  | DashboardEmbedOptions
  | QuestionEmbedOptions
  | ExplorationEmbedOptions
  | CurationEmbedOptions;

/** Settings used by the sdk embed route */
export type SdkIframeEmbedSettings = SdkIframeEmbedBaseSettings &
  SdkIframeEmbedTemplateSettings;

/** Settings used by the embed.js constructor */
export type SdkIframeEmbedTagSettings = SdkIframeEmbedSettings & {
  target: string | HTMLElement;
  iframeClassName?: string;
};
