import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkInternalNavigationBackButton } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationBackButton";
import {
  BackButton,
  Breakout,
  BreakoutDropdown,
  ChartTypeDropdown,
  ChartTypeSelector,
  DownloadWidget,
  DownloadWidgetDropdown,
  Editor,
  EditorButton,
  Filter,
  FilterDropdown,
  QuestionResetButton,
  QuestionSettings,
  QuestionSettingsDropdown,
  QuestionVisualization,
  SaveButton,
  SdkSaveQuestionForm,
  SqlParametersList,
  Summarize,
  SummarizeDropdown,
  Title,
  VisualizationButton,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components";
import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";

import { QuestionAlertsButton } from "../notifications/QuestionAlertsButton";

import { interactiveQuestionSchema } from "./InteractiveQuestion.schema";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionProps = Omit<
  SdkQuestionProps,
  "token" | "getClickActionMode" | "navigateToNewCard" | "backToDashboard"
>;

/**
 * @interface
 */
export type InteractiveQuestionComponents = {
  /** @deprecated Use `InteractiveQuestion.NavigationBackButton` instead */
  BackButton: typeof BackButton;
  /** Back button to navigate back after drills and internal navigation. It will render null if there's nothing to go back to */
  NavigationBackButton: typeof SdkInternalNavigationBackButton;
  Filter: typeof Filter;
  FilterDropdown: typeof FilterDropdown;
  ResetButton: typeof QuestionResetButton;
  Title: typeof Title;
  Summarize: typeof Summarize;
  SummarizeDropdown: typeof SummarizeDropdown;
  /** @deprecated Use `InteractiveQuestion.Editor` instead */
  Notebook: typeof Editor;
  Editor: typeof Editor;
  /** @deprecated Use `InteractiveQuestion.EditorButton` instead */
  NotebookButton: typeof EditorButton;
  EditorButton: typeof EditorButton;
  QuestionVisualization: typeof QuestionVisualization;
  VisualizationButton: typeof VisualizationButton;
  SaveQuestionForm: typeof SdkSaveQuestionForm;
  SaveButton: typeof SaveButton;
  ChartTypeSelector: typeof ChartTypeSelector;
  ChartTypeDropdown: typeof ChartTypeDropdown;
  QuestionSettings: typeof QuestionSettings;
  QuestionSettingsDropdown: typeof QuestionSettingsDropdown;
  Breakout: typeof Breakout;
  BreakoutDropdown: typeof BreakoutDropdown;
  DownloadWidget: typeof DownloadWidget;
  DownloadWidgetDropdown: typeof DownloadWidgetDropdown;
  AlertsButton: typeof QuestionAlertsButton;
  SqlParametersList: typeof SqlParametersList;
};

export const _InteractiveQuestion = (props: InteractiveQuestionProps) => (
  <SdkQuestion {...props} />
);

const subComponents: InteractiveQuestionComponents = {
  BackButton: BackButton,
  NavigationBackButton: SdkInternalNavigationBackButton,
  Filter: Filter,
  FilterDropdown: FilterDropdown,
  ResetButton: QuestionResetButton,
  Title: Title,
  Summarize: Summarize,
  SummarizeDropdown: SummarizeDropdown,
  Notebook: Editor,
  Editor: Editor,
  NotebookButton: EditorButton,
  EditorButton: EditorButton,
  QuestionVisualization: QuestionVisualization,
  SaveQuestionForm: SdkSaveQuestionForm,
  SaveButton: SaveButton,
  ChartTypeSelector: ChartTypeSelector,
  QuestionSettings: QuestionSettings,
  QuestionSettingsDropdown: QuestionSettingsDropdown,
  BreakoutDropdown: BreakoutDropdown,
  Breakout: Breakout,
  ChartTypeDropdown: ChartTypeDropdown,
  DownloadWidget: DownloadWidget,
  DownloadWidgetDropdown: DownloadWidgetDropdown,
  AlertsButton: QuestionAlertsButton,
  VisualizationButton: VisualizationButton,
  SqlParametersList: SqlParametersList,
};

export const InteractiveQuestion = Object.assign(
  withPublicComponentWrapper(_InteractiveQuestion, {
    supportsGuestEmbed: false,
  }),
  subComponents,
  { schema: interactiveQuestionSchema },
);
