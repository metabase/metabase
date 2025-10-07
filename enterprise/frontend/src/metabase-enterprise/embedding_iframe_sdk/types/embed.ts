import type { MetabaseError } from "embedding-sdk-bundle/errors";
import type { MetabaseErrorCode } from "embedding-sdk-bundle/errors/error-code";
import type { MetabaseAuthMethod } from "embedding-sdk-bundle/types";
import type {
  MetabaseEmbeddingSessionToken,
  MetabaseFetchRequestTokenFn,
} from "embedding-sdk-bundle/types/refresh-token";
import type {
  CollectionBrowserListColumns,
  EmbeddingEntityType,
  EntityTypeFilterKeys,
  MetabaseTheme,
  SqlParameterValues,
} from "embedding-sdk-package";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";
import type { CollectionId } from "metabase-types/api";

/** Events that the embed.js script listens for */
export type SdkIframeEmbedTagMessage =
  | { type: "metabase.embed.iframeReady" }
  | { type: "metabase.embed.requestSessionToken" };

/** Events that the sdk embed route listens for */
export type SdkIframeEmbedMessage =
  | {
      type: "metabase.embed.setSettings";
      data: SdkIframeEmbedSettings;
    }
  | {
      type: "metabase.embed.submitSessionToken";
      data: {
        authMethod: MetabaseAuthMethod;
        sessionToken: MetabaseEmbeddingSessionToken;
      };
    }
  | {
      type: "metabase.embed.reportAuthenticationError";
      data: {
        error: MetabaseError<MetabaseErrorCode, unknown>;
      };
    }
  | {
      type: "metabase.embed.reportAnalytics";
      data: {
        usageAnalytics: EmbeddedAnalyticsJsEventSchema;
        embedHostUrl: string;
      };
    };

// --- Embed Option Interfaces ---

export interface DashboardEmbedOptions {
  componentName: "metabase-dashboard";
  dashboardId: number | string;

  drills?: boolean;
  withTitle?: boolean;
  withDownloads?: boolean;

  // parameters
  initialParameters?: ParameterValues;
  hiddenParameters?: string[];

  // incompatible options
  template?: never;
  questionId?: never;
}

export interface QuestionEmbedOptions {
  componentName: "metabase-question";
  questionId: number | string;

  drills?: boolean;
  withTitle?: boolean;
  withDownloads?: boolean;
  targetCollection?: CollectionId;
  entityTypes?: EntityTypeFilterKeys[];
  isSaveEnabled?: boolean;

  // parameters
  initialSqlParameters?: SqlParameterValues;
  hiddenParameters?: string[];

  // incompatible options
  template?: never;
  dashboardId?: never;
}

export interface ExplorationEmbedOptions {
  componentName: "metabase-question";
  template: "exploration";

  isSaveEnabled?: boolean;
  targetCollection?: CollectionId;
  entityTypes?: EntityTypeFilterKeys[];

  // incompatible options
  dashboardId?: never;
  questionId?: never;
}

export interface BrowserEmbedOptions {
  componentName: "metabase-browser";

  /** Which collection to start from? */
  initialCollection: CollectionId;

  /** Whether the content manager is in read-only mode. Defaults to true. */
  readOnly?: boolean;

  /** Which columns to show on the collection browser */
  collectionVisibleColumns?: CollectionBrowserListColumns[];

  /** How many items to show per page in the collection browser */
  collectionPageSize?: number;

  /** Which entities to show on the collection browser */
  collectionEntityTypes?: CollectionBrowserEntityTypes[];

  /** Which entities to show on the question's data picker */
  dataPickerEntityTypes?: EmbeddingEntityType[];

  /** Whether to show the "New exploration" button. Defaults to true. */
  withNewQuestion?: boolean;

  /** Whether to show the "New dashboard" button. Defaults to true. Only applies when readOnly is false. */
  withNewDashboard?: boolean;

  template?: never;
  questionId?: never;
  dashboardId?: never;
}

export interface MetabotEmbedOptions {
  componentName: "metabase-metabot";

  /** Layout mode for the metabot interface */
  layout?: "auto" | "sidebar" | "stacked";

  // incompatible options
  template?: never;
  questionId?: never;
  dashboardId?: never;
}

type CollectionBrowserEntityTypes =
  | "collection"
  | "dashboard"
  | "question"
  | "model";

export type SdkIframeEmbedBaseSettings = {
  apiKey?: string;
  instanceUrl: string;
  theme?: MetabaseTheme;
  locale?: string;
  preferredAuthMethod?: MetabaseAuthMethod;
  fetchRequestToken?: MetabaseFetchRequestTokenFn;

  /** Whether we should use the existing user session (i.e. admin user's cookie) */
  useExistingUserSession?: boolean;

  // Whether the embed is running on localhost. Cannot be set by the user.
  _isLocalhost?: boolean;
};

export type SdkIframeEmbedTemplateSettings =
  | DashboardEmbedOptions
  | QuestionEmbedOptions
  | ExplorationEmbedOptions
  | BrowserEmbedOptions
  | MetabotEmbedOptions;

/** Settings used by the sdk embed route */
export type SdkIframeEmbedSettings = Omit<
  SdkIframeEmbedBaseSettings,
  "fetchRequestToken"
> &
  SdkIframeEmbedTemplateSettings;

export type SdkIframeEmbedElementSettings = SdkIframeEmbedBaseSettings &
  (
    | DashboardEmbedOptions
    | QuestionEmbedOptions
    | (Omit<ExplorationEmbedOptions, "questionId"> & { questionId: "new" })
    | BrowserEmbedOptions
    | MetabotEmbedOptions
  );

export type SdkIframeEmbedEvent = { type: "ready" };

export type SdkIframeEmbedEventHandler = () => void;

/** Keys that can be used to update the embed settings */
export type SdkIframeEmbedSettingKey =
  | keyof SdkIframeEmbedBaseSettings
  | keyof DashboardEmbedOptions
  | keyof QuestionEmbedOptions
  | keyof ExplorationEmbedOptions
  | keyof BrowserEmbedOptions
  | keyof MetabotEmbedOptions;
