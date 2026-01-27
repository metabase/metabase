import type { CollectionBrowserListColumns } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import type { MetabaseError } from "embedding-sdk-bundle/errors";
import type { MetabaseErrorCode } from "embedding-sdk-bundle/errors/error-code";
import type {
  EntityTypeFilterKeys,
  MetabaseAuthMethod,
  MetabaseTheme,
  SqlParameterValues,
} from "embedding-sdk-bundle/types";
import type {
  SdkIframeDashboardEmbedSettings,
  SdkIframeQuestionEmbedSettings,
} from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import type {
  MetabaseEmbeddingSessionToken,
  MetabaseFetchRequestTokenFn,
} from "metabase/embedding-sdk/types/refresh-token";
import type { StrictUnion } from "metabase/embedding-sdk/types/utils";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";
import type { CollectionId } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";
import type { ModularEmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

/** Events that the embed.js script listens for */
export type SdkIframeEmbedTagMessage =
  | SdkIframeEmbedTagIframeReadyMessage
  | SdkIframeEmbedTagRequestSessionTokenMessage;

export type SdkIframeEmbedTagIframeReadyMessage = {
  type: "metabase.embed.iframeReady";
};
export type SdkIframeEmbedTagRequestSessionTokenMessage = {
  type: "metabase.embed.requestSessionToken";
};

/** Events that the sdk embed route listens for */
export type SdkIframeEmbedMessage =
  | SdkIframeEmbedSetSettingsMessage
  | SdkIframeEmbedSubmitSessionTokenMessage
  | SdkIframeEmbedReportAuthenticationError
  | SdkIframeEmbedReportAnalytics;

export type SdkIframeEmbedSetSettingsMessage = {
  type: "metabase.embed.setSettings";
  data: SdkIframeEmbedSettings;
};
export type SdkIframeEmbedSubmitSessionTokenMessage = {
  type: "metabase.embed.submitSessionToken";
  data: {
    authMethod: MetabaseAuthMethod;
    sessionToken: MetabaseEmbeddingSessionToken;
  };
};
export type SdkIframeEmbedReportAuthenticationError = {
  type: "metabase.embed.reportAuthenticationError";
  data: {
    error: MetabaseError<MetabaseErrorCode, unknown>;
  };
};
export type SdkIframeEmbedReportAnalytics = {
  type: "metabase.embed.reportAnalytics";
  data: {
    usageAnalytics: EmbeddedAnalyticsJsEventSchema;
    embedHostUrl: string;
  };
};

// --- Embed Option Interfaces ---

export type DashboardEmbedOptions = StrictUnion<
  { dashboardId: number | string | null } | { token: EntityToken }
> & {
  componentName: "metabase-dashboard";

  drills?: boolean;
  withTitle?: boolean;
  withDownloads?: boolean;
  withSubscriptions?: boolean;

  // parameters
  initialParameters?: ParameterValues;
  hiddenParameters?: string[];

  // incompatible options
  template?: never;
  questionId?: never;
};

export type QuestionEmbedOptions = StrictUnion<
  { questionId: number | string | null } | { token: EntityToken }
> & {
  componentName: "metabase-question";

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
};

export interface ExplorationEmbedOptions {
  componentName: "metabase-question";
  template: "exploration";

  isSaveEnabled?: boolean;
  targetCollection?: CollectionId;
  entityTypes?: EntityTypeFilterKeys[];

  // incompatible options
  dashboardId?: never;
  questionId?: never;
  token?: never;
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
  dataPickerEntityTypes?: ModularEmbeddingEntityType[];

  /** Whether to show the "New exploration" button. Defaults to true. */
  withNewQuestion?: boolean;

  /** Whether to show the "New dashboard" button. Defaults to true. Only applies when readOnly is false. */
  withNewDashboard?: boolean;

  template?: never;
  questionId?: never;
  dashboardId?: never;
  token?: never;
}

export interface MetabotEmbedOptions {
  componentName: "metabase-metabot";

  /** Layout mode for the metabot interface */
  layout?: "auto" | "sidebar" | "stacked";

  // incompatible options
  template?: never;
  questionId?: never;
  dashboardId?: never;
  token?: never;
}

type CollectionBrowserEntityTypes =
  | "collection"
  | "dashboard"
  | "question"
  | "model";

export type SdkIframeEmbedBaseSettings = {
  isGuest?: boolean;
  apiKey?: string;
  instanceUrl: string;
  theme?: MetabaseTheme;
  locale?: string;
  preferredAuthMethod?: MetabaseAuthMethod;
  jwtProviderUri?: string;
  fetchRequestToken?: MetabaseFetchRequestTokenFn;

  /** Whether we should use the existing user session (i.e. admin user's cookie) */
  useExistingUserSession?: boolean;

  // Whether the embed is running on localhost. Cannot be set by the user.
  _isLocalhost?: boolean;
};

export type SdkIframeEmbedAuthTypeSettings = {
  isSso: boolean;
  isGuest: boolean;
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
    | (Omit<ExplorationEmbedOptions, "questionId"> & {
        questionId: "new" | "new-native";
      })
    | BrowserEmbedOptions
    | MetabotEmbedOptions
  );

export type SdkIframeEmbedEvent = { type: "ready" };

export type SdkIframeEmbedEventHandler = () => void;

/** Keys that can be used to update the embed settings */
export type SdkIframeEmbedSettingKey =
  | keyof SdkIframeEmbedBaseSettings
  | keyof SdkIframeDashboardEmbedSettings
  | keyof SdkIframeQuestionEmbedSettings
  | keyof ExplorationEmbedOptions
  | keyof BrowserEmbedOptions
  | keyof MetabotEmbedOptions;
