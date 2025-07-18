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
  type BaseSdkQuestionProps,
  type SdkQuestionProps,
  type BackButtonProps,
  type BreakoutDropdownProps,
  type ChartTypeDropdownProps,
  type ChartTypeSelectorProps,
  type DownloadWidgetProps,
  type DownloadWidgetDropdownProps,
  type EditorProps,
  type EditorButtonProps,
  type FilterProps,
  type FilterDropdownProps,
  type QuestionSettingsProps,
  type QuestionSettingsDropdownProps,
  type QuestionVisualizationProps,
  type ResetButtonProps,
  type SaveButtonProps,
  type SaveQuestionFormProps,
  type SummarizeDropdownProps,
  type TitleProps,
  type DrillThroughQuestionProps,
  StaticQuestion,
  type StaticQuestionProps,
} from "./question";
export {
  MetabaseProvider,
  type MetabaseProviderProps,
} from "./MetabaseProvider";

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
