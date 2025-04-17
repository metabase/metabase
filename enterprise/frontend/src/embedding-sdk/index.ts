// Mantine styles need to be imported before any of our components so that our styles win over
// the default mantine styles
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

// polyfills useSyncExternalStore for React 17
import "./lib/polyfill/use-sync-external-store";

import "metabase/lib/dayjs";

import "ee-plugins";

// we need to manually import them here to make sure they are included in the bundle
// as they're dynamically loaded in the main codebase
import "html2canvas-pro";
import "jspdf";

export * from "./hooks/public";
export * from "./components/public";

export type {
  CustomDashboardCardMenuItem,
  DashCardMenuItem,
  DashboardCardCustomMenuItem,
  DashboardCardMenuCustomElement,
  EntityTypeFilterKeys,
  IconName,
  LoginStatus,
  MetabaseAuthConfig,
  MetabaseClickActionPluginsConfig,
  MetabaseClickAction,
  MetabaseCollection,
  MetabaseCollectionItem,
  MetabaseDataPointObject,
  MetabaseDashboard,
  MetabaseDashboardPluginsConfig,
  MetabasePluginsConfig,
  MetabaseQuestion,
  MetabaseUser,
  SdkCollectionId,
  SdkDashboardId,
  SdkDashboardLoadEvent,
  SdkEntityId,
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

export type {
  MetabaseTheme,
  MetabaseColors,
  MetabaseComponentTheme,
} from "metabase/embedding-sdk/theme";
