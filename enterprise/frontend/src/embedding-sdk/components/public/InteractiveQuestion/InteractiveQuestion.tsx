import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionProps = Omit<
  SdkQuestionProps,
  "getClickActionMode" | "navigateToNewCard" | "backToDashboard"
>;

/**
 * @interface
 */
export type InteractiveQuestionComponents = {
  BackButton: typeof SdkQuestion.BackButton;
  Filter: typeof SdkQuestion.Filter;
  FilterDropdown: typeof SdkQuestion.FilterDropdown;
  ResetButton: typeof SdkQuestion.ResetButton;
  Title: typeof SdkQuestion.Title;
  Summarize: typeof SdkQuestion.Summarize;
  SummarizeDropdown: typeof SdkQuestion.SummarizeDropdown;
  /** @deprecated Use `InteractiveQuestion.Editor` instead */
  Notebook: typeof SdkQuestion.Editor;
  Editor: typeof SdkQuestion.Editor;
  /** @deprecated Use `InteractiveQuestion.EditorButton` instead */
  NotebookButton: typeof SdkQuestion.EditorButton;
  EditorButton: typeof SdkQuestion.EditorButton;
  QuestionVisualization: typeof SdkQuestion.QuestionVisualization;
  VisualizationButton: typeof SdkQuestion.VisualizationButton;
  SaveQuestionForm: typeof SdkQuestion.SaveQuestionForm;
  SaveButton: typeof SdkQuestion.SaveButton;
  ChartTypeSelector: typeof SdkQuestion.ChartTypeSelector;
  ChartTypeDropdown: typeof SdkQuestion.ChartTypeDropdown;
  QuestionSettings: typeof SdkQuestion.QuestionSettings;
  QuestionSettingsDropdown: typeof SdkQuestion.QuestionSettingsDropdown;
  Breakout: typeof SdkQuestion.Breakout;
  BreakoutDropdown: typeof SdkQuestion.BreakoutDropdown;
  DownloadWidget: typeof SdkQuestion.DownloadWidget;
  DownloadWidgetDropdown: typeof SdkQuestion.DownloadWidgetDropdown;
};

export const _InteractiveQuestion = (props: InteractiveQuestionProps) => (
  <SdkQuestion {...props} />
);

const subComponents: InteractiveQuestionComponents = {
  BackButton: SdkQuestion.BackButton,
  Filter: SdkQuestion.Filter,
  FilterDropdown: SdkQuestion.FilterDropdown,
  ResetButton: SdkQuestion.ResetButton,
  Title: SdkQuestion.Title,
  Summarize: SdkQuestion.Summarize,
  SummarizeDropdown: SdkQuestion.SummarizeDropdown,
  Notebook: SdkQuestion.Editor,
  Editor: SdkQuestion.Editor,
  NotebookButton: SdkQuestion.EditorButton,
  EditorButton: SdkQuestion.EditorButton,
  QuestionVisualization: SdkQuestion.QuestionVisualization,
  SaveQuestionForm: SdkQuestion.SaveQuestionForm,
  SaveButton: SdkQuestion.SaveButton,
  ChartTypeSelector: SdkQuestion.ChartTypeSelector,
  QuestionSettings: SdkQuestion.QuestionSettings,
  QuestionSettingsDropdown: SdkQuestion.QuestionSettingsDropdown,
  BreakoutDropdown: SdkQuestion.BreakoutDropdown,
  Breakout: SdkQuestion.Breakout,
  ChartTypeDropdown: SdkQuestion.ChartTypeDropdown,
  DownloadWidget: SdkQuestion.DownloadWidget,
  DownloadWidgetDropdown: SdkQuestion.DownloadWidgetDropdown,
  VisualizationButton: SdkQuestion.VisualizationButton,
};

export const InteractiveQuestion = Object.assign(
  _InteractiveQuestion,
  subComponents,
);
