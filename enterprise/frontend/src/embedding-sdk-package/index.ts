// eslint-disable-next-line no-external-references-for-sdk-package-code
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
// eslint-disable-next-line no-external-references-for-sdk-package-code
import { defineEmbeddingSdkPackageBuildInfo } from "metabase/embedding-sdk/lib/define-embedding-sdk-package-build-info";
// eslint-disable-next-line no-external-references-for-sdk-package-code
import { defineGlobalDependencies } from "metabase/embedding-sdk/lib/define-global-dependencies";

// Enable SDK mode as we are in the SDK package
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

defineEmbeddingSdkPackageBuildInfo();
defineGlobalDependencies();

export { CollectionBrowser } from "./components/public/CollectionBrowser";
export { CreateQuestion } from "./components/public/CreateQuestion";
export { CreateDashboardModal } from "./components/public/CreateDashboardModal";
export { EditableDashboard } from "./components/public/dashboard/EditableDashboard";
export { InteractiveDashboard } from "./components/public/dashboard/InteractiveDashboard";
export { StaticDashboard } from "./components/public/dashboard/StaticDashboard";
export { InteractiveQuestion } from "./components/public/InteractiveQuestion";
export { StaticQuestion } from "./components/public/StaticQuestion";
export { MetabaseProvider } from "./components/public/MetabaseProvider";
export { MetabotQuestion } from "./components/public/MetabotQuestion";
export * from "./components/public/debug/SdkDebugInfo";

export { useApplicationName } from "./hooks/public/use-application-name";
export { useAvailableFonts } from "./hooks/public/use-available-fonts";
export { useCurrentUser } from "./hooks/public/use-current-user";
export { useCreateDashboardApi } from "./hooks/public/use-create-dashboard-api";
export { useMetabaseAuthStatus } from "./hooks/public/use-metabase-auth-status";

export { defineMetabaseAuthConfig } from "./lib/public/define-metabase-auth-config";
export { defineMetabaseTheme } from "./lib/public/define-metabase-theme";

export {
  type CollectionBrowserProps,
  type CollectionBrowserListColumns,
} from "embedding-sdk-bundle/components/public/CollectionBrowser";
export { type CreateDashboardModalProps } from "embedding-sdk-bundle/components/public/CreateDashboardModal";
export { type CreateQuestionProps } from "embedding-sdk-bundle/components/public/CreateQuestion";
export type {
  StaticDashboardProps,
  InteractiveDashboardProps,
  EditableDashboardProps,
} from "embedding-sdk-bundle/components/public/dashboard";
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
} from "embedding-sdk-bundle/components/public/SdkQuestion";
export {
  type InteractiveQuestionComponents,
  type InteractiveQuestionProps,
} from "embedding-sdk-bundle/components/public/InteractiveQuestion";
export {
  type StaticQuestionProps,
  type StaticQuestionComponents,
} from "embedding-sdk-bundle/components/public/StaticQuestion";
export { type MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";

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
} from "embedding-sdk-bundle/types";

export type {
  UserBackendJwtResponse,
  MetabaseFetchRequestTokenFn,
  MetabaseEmbeddingSessionToken,
} from "embedding-sdk-bundle/types/refresh-token";

export type { EmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

export type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
export type { IconName } from "metabase/embedding-sdk/types/icon";
