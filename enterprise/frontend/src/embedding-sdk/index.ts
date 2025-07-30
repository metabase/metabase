import { defineGlobalDependencies } from "embedding-sdk/sdk-wrapper/lib/private/define-global-dependencies";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// Enable SDK mode as we are in the SDK bundle
// This applies to SDK derivatives such as new iframe embedding.
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

defineGlobalDependencies();

export { CollectionBrowser } from "./sdk-wrapper/components/public/CollectionBrowser";
export { CreateQuestion } from "./sdk-wrapper/components/public/CreateQuestion";
export { CreateDashboardModal } from "./sdk-wrapper/components/public/CreateDashboardModal";
export { EditableDashboard } from "./sdk-wrapper/components/public/dashboard/EditableDashboard";
export { InteractiveDashboard } from "./sdk-wrapper/components/public/dashboard/InteractiveDashboard";
export { StaticDashboard } from "./sdk-wrapper/components/public/dashboard/StaticDashboard";
export { InteractiveQuestion } from "./sdk-wrapper/components/public/InteractiveQuestion";
export { StaticQuestion } from "./sdk-wrapper/components/public/StaticQuestion";
export { MetabaseProvider } from "./sdk-wrapper/components/public/MetabaseProvider";
export { MetabotQuestion } from "./sdk-wrapper/components/public/MetabotQuestion";

export { useApplicationName } from "./sdk-wrapper/hooks/public/use-application-name";
export { useAvailableFonts } from "./sdk-wrapper/hooks/public/use-available-fonts";
export { useCurrentUser } from "./sdk-wrapper/hooks/public/use-current-user";
export { useMetabaseAuthStatus } from "./sdk-wrapper/hooks/public/use-metabase-auth-status";

export * from "./sdk-wrapper/lib/public/define-metabase-auth-config";
export * from "./sdk-wrapper/lib/public/define-metabase-theme";

export {
  type CollectionBrowserProps,
  type CollectionBrowserListColumns,
} from "./components/public/CollectionBrowser";
export {
  type CreateDashboardModalProps,
  type CreateDashboardValues,
} from "./components/public/CreateDashboardModal";
export { type CreateQuestionProps } from "./components/public/CreateQuestion";
export type {
  StaticDashboardProps,
  InteractiveDashboardProps,
  EditableDashboardProps,
} from "./components/public/dashboard";
export {
  type SdkQuestionProps,
  type InteractiveQuestionBackButtonProps,
  type InteractiveQuestionBreakoutDropdownProps,
  type InteractiveQuestionChartTypeDropdownProps,
  type InteractiveQuestionChartTypeSelectorProps,
  type InteractiveQuestionDownloadWidgetProps,
  type InteractiveQuestionDownloadWidgetDropdownProps,
  type InteractiveQuestionEditorProps,
  type InteractiveQuestionEditorButtonProps,
  type InteractiveQuestionFilterProps,
  type InteractiveQuestionFilterDropdownProps,
  type InteractiveQuestionQuestionSettingsProps,
  type InteractiveQuestionQuestionSettingsDropdownProps,
  type InteractiveQuestionQuestionVisualizationProps,
  type InteractiveQuestionResetButtonProps,
  type InteractiveQuestionSaveButtonProps,
  type InteractiveQuestionSaveQuestionFormProps,
  type InteractiveQuestionSummarizeDropdownProps,
  type InteractiveQuestionTitleProps,
  type DrillThroughQuestionProps,
} from "./components/public/SdkQuestion";
export {
  type InteractiveQuestionComponents,
  type InteractiveQuestionProps,
} from "./components/public/InteractiveQuestion";
export {
  type StaticQuestionProps,
  type StaticQuestionComponents,
} from "./components/public/StaticQuestion";
export { type MetabaseProviderProps } from "./types/metabase-provider";

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
