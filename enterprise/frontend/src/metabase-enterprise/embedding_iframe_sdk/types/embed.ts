import type {
  CollectionBrowserListColumns,
  EmbeddingEntityType,
  EntityTypeFilterKeys,
  MetabaseTheme,
  SqlParameterValues,
} from "embedding-sdk";
import type { MetabaseError } from "embedding-sdk/errors";
import type { MetabaseAuthMethod } from "embedding-sdk/types";
import type { MetabaseEmbeddingSessionToken } from "embedding-sdk/types/refresh-token";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
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
        error: MetabaseError<string, unknown>;
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

/** Shared properties between the content manager templates. */
export interface ContentManagerCommonEmbedOptions {
  initialCollection: CollectionId;

  /** Which collections to show on the collection browser */
  collectionVisibleColumns?: CollectionBrowserListColumns[];

  /** How many items to show per page in the collection browser */
  collectionPageSize?: number;

  /** Which entities to show on the collection browser */
  collectionEntityTypes?: CollectionBrowserEntityTypes[];

  /** Which entities to show on the question's data picker */
  dataPickerEntityTypes?: EmbeddingEntityType[];

  /** Whether to show the "New Exploration" button. Defaults to true. */
  withNewQuestion?: boolean;

  questionId?: never;
  dashboardId?: never;
}

export interface CurateContentEmbedOptions
  extends ContentManagerCommonEmbedOptions {
  componentName: "metabase-curate-content";

  /** Whether to show the "New Dashboard" button. Defaults to true. */
  withNewDashboard?: boolean;
}

export interface ViewContentEmbedOptions
  extends ContentManagerCommonEmbedOptions {
  componentName: "metabase-view-content";
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

  /** Whether we should use the existing user session (i.e. admin user's cookie) */
  useExistingUserSession?: boolean;

  // Whether the embed is running on localhost. Cannot be set by the user.
  _isLocalhost?: boolean;
};

export type SdkIframeEmbedTemplateSettings =
  | DashboardEmbedOptions
  | QuestionEmbedOptions
  | ExplorationEmbedOptions
  | CurateContentEmbedOptions
  | ViewContentEmbedOptions;

/** Settings used by the sdk embed route */
export type SdkIframeEmbedSettings = SdkIframeEmbedBaseSettings &
  SdkIframeEmbedTemplateSettings;

export type SdkIframeEmbedEvent = { type: "ready" };

export type SdkIframeEmbedEventHandler = () => void;

/** Keys that can be used to update the embed settings */
export type SdkIframeEmbedSettingKey =
  | keyof SdkIframeEmbedBaseSettings
  | keyof DashboardEmbedOptions
  | keyof QuestionEmbedOptions
  | keyof ExplorationEmbedOptions
  | keyof CurateContentEmbedOptions
  | keyof ViewContentEmbedOptions;
