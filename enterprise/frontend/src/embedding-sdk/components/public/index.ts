import type { MetabaseAuthConfig } from "embedding-sdk/types";
import { defineMetabaseTheme } from "metabase/embedding-sdk/theme";

export {
  CollectionBrowser,
  type CollectionBrowserProps,
  type CollectionBrowserListColumns,
} from "./CollectionBrowser";
export {
  CreateDashboardModal,
  useCreateDashboardApi,
  type CreateDashboardModalProps,
  type CreateDashboardValues,
} from "./CreateDashboardModal";
export { CreateQuestion, type CreateQuestionProps } from "./CreateQuestion";
export {
  StaticDashboard,
  InteractiveDashboard,
  EditableDashboard,
} from "./dashboard";
export type {
  StaticDashboardProps,
  InteractiveDashboardProps,
  EditableDashboardProps,
} from "./dashboard";
export {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "./InteractiveQuestion";
export {
  type BaseSdkQuestionProps,
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
} from "./SdkQuestion";
export {
  MetabaseProvider,
  type MetabaseProviderProps,
} from "./MetabaseProvider";
export { StaticQuestion, type StaticQuestionProps } from "./StaticQuestion";

// These functions looks useless but it's a trick to have a way to type the config
// while having code snippets the same across js and ts. This works because the
// type is only in the function declaration and not where the config is
// declared. `const authConfig = defineMetabaseAuthConfig({})` will have the type of
// `MetabaseAuthConfig` and even provide autocompletion for js users depending on their
// IDE configuration.
/**
 * Defines a Metabase auth config.
 *
 * @function
 * @category MetabaseProvider
 */
export const defineMetabaseAuthConfig = (
  config: MetabaseAuthConfig,
): MetabaseAuthConfig => config;

export { defineMetabaseTheme };

/**
 * Intended for debugging purposes only, so we don't want to expose it in the d.ts files.
 * @internal
 */
export { SdkDebugInfo } from "./debug/SdkDebugInfo";

export { MetabotQuestion } from "./MetabotQuestion";
