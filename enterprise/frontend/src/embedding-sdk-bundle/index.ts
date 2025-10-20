import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// Enable SDK mode as we are in the SDK bundle
// This applies to SDK derivatives such as new iframe embedding.
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

// Mantine styles need to be imported before any of our components so that our styles win over
// the default mantine styles
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

import "metabase/lib/dayjs";

// Import the EE plugins required by the embedding sdk.
import "sdk-ee-plugins";

// Imports which are only applicable to the embedding sdk, and not the new iframe embedding.
import "sdk-specific-imports";

export * from "./hooks/public";
export * from "./components/public";

export type {
  CustomDashboardCardMenuItem,
  DashCardMenuItem,
  DashboardCardCustomMenuItem,
  DashboardCardMenuCustomElement,
  DashboardCardMenu,
} from "metabase/dashboard/components/DashCard/DashCardMenu/dashcard-menu";

export type {
  ButtonProps,
  ChartColor,
  EntityTypeFilterKeys,
  LoginStatus,
  MetabaseAuthConfig,
  MetabaseAuthConfigWithApiKey,
  MetabaseAuthConfigWithJwt,
  MetabaseAuthConfigWithSaml,
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
  SdkLoadingError,
  SdkQuestionId,
  SdkQuestionTitleProps,
  SdkUserId,
  SqlParameterValues,
} from "./types";

export type {
  UserBackendJwtResponse,
  MetabaseFetchRequestTokenFn,
  MetabaseEmbeddingSessionToken,
} from "./types/refresh-token";

export type { EmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

export type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
export type { IconName } from "metabase/embedding-sdk/types/icon";
