import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { defineEmbeddingSdkPackageBuildInfo } from "metabase/embedding-sdk/lib/define-embedding-sdk-package-build-info";
import { defineGlobalDependencies } from "metabase/embedding-sdk/lib/define-global-dependencies";

// Enable SDK mode as we are in the SDK package
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

defineEmbeddingSdkPackageBuildInfo();
defineGlobalDependencies();

export { CollectionBrowser } from "embedding-sdk-package/components/public/CollectionBrowser";
export { CreateQuestion } from "embedding-sdk-package/components/public/CreateQuestion";
export { CreateDashboardModal } from "embedding-sdk-package/components/public/CreateDashboardModal";
export { EditableDashboard } from "embedding-sdk-package/components/public/dashboard/EditableDashboard";
export { InteractiveDashboard } from "embedding-sdk-package/components/public/dashboard/InteractiveDashboard";
export { StaticDashboard } from "embedding-sdk-package/components/public/dashboard/StaticDashboard";
export { InteractiveQuestion } from "embedding-sdk-package/components/public/InteractiveQuestion";
export { StaticQuestion } from "embedding-sdk-package/components/public/StaticQuestion";
export { MetabaseProvider } from "embedding-sdk-package/components/public/MetabaseProvider";
export { MetabotQuestion } from "embedding-sdk-package/components/public/MetabotQuestion";
export * from "embedding-sdk-package/components/public/debug/SdkDebugInfo";

export { useApplicationName } from "embedding-sdk-package/hooks/public/use-application-name";
export { useAvailableFonts } from "embedding-sdk-package/hooks/public/use-available-fonts";
export { useCurrentUser } from "embedding-sdk-package/hooks/public/use-current-user";
export { useCreateDashboardApi } from "embedding-sdk-package/hooks/public/use-create-dashboard-api";
export { useMetabaseAuthStatus } from "embedding-sdk-package/hooks/public/use-metabase-auth-status";

export { defineMetabaseAuthConfig } from "embedding-sdk-package/lib/public/define-metabase-auth-config";
export { defineMetabaseTheme } from "embedding-sdk-package/lib/public/define-metabase-theme";

export {
  type CollectionBrowserProps,
  type CollectionBrowserListColumns,
} from "./components/public/CollectionBrowser";
export { type CreateDashboardModalProps } from "./components/public/CreateDashboardModal";
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
  CreateDashboardValues,
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
