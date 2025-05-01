// Mantine styles need to be imported before any of our components so that our styles win over
// the default mantine styles
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

// polyfills useSyncExternalStore for React 17
import "./lib/polyfill/use-sync-external-store";

import "metabase/lib/dayjs";

import "sdk-ee-plugins";

export * from "./hooks/public";
export * from "./components/public";

export type {
  ButtonProps,
  ChartColor,
  CustomDashboardCardMenuItem,
  DashCardMenuItem,
  DashboardCardCustomMenuItem,
  DashboardCardMenuCustomElement,
  EntityTypeFilterKeys,
  IconName,
  LoginStatus,
  MetabaseAuthConfig,
  MetabaseAuthConfigWithApiKey,
  MetabaseAuthConfigWithProvider,
  MetabaseClickActionPluginsConfig,
  MetabaseColors,
  MetabaseClickAction,
  MetabaseComponentTheme,
  MetabaseCollection,
  MetabaseCollectionItem,
  MetabaseDataPointObject,
  MetabaseDashboard,
  MetabaseDashboardPluginsConfig,
  MetabaseFontFamily,
  MetabasePluginsConfig,
  MetabaseQuestion,
  MetabaseTheme,
  MetabaseUser,
  SdkCollectionId,
  SdkDashboardId,
  SdkDashboardLoadEvent,
  SdkEntityId,
  SdkErrorComponent,
  SdkErrorComponentProps,
  SdkEventHandlersConfig,
  SdkQuestionId,
  SdkQuestionTitleProps,
  SdkUserId,
  SqlParameterValues,
} from "./types";

export type {
  MetabaseFetchRequestTokenFn,
  MetabaseEmbeddingSessionToken,
} from "./types/refresh-token";
