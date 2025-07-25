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
export const _InteractiveQuestion = (props: InteractiveQuestionProps) => (
  <SdkQuestion {...props} />
);

export const InteractiveQuestion =
  _InteractiveQuestion as typeof _InteractiveQuestion & {
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

InteractiveQuestion.BackButton = SdkQuestion.BackButton;
InteractiveQuestion.Filter = SdkQuestion.Filter;
InteractiveQuestion.FilterDropdown = SdkQuestion.FilterDropdown;
InteractiveQuestion.ResetButton = SdkQuestion.ResetButton;
InteractiveQuestion.Title = SdkQuestion.Title;
InteractiveQuestion.Summarize = SdkQuestion.Summarize;
InteractiveQuestion.SummarizeDropdown = SdkQuestion.SummarizeDropdown;
InteractiveQuestion.Notebook = SdkQuestion.Editor;
InteractiveQuestion.Editor = SdkQuestion.Editor;
InteractiveQuestion.NotebookButton = SdkQuestion.EditorButton;
InteractiveQuestion.EditorButton = SdkQuestion.EditorButton;
InteractiveQuestion.QuestionVisualization = SdkQuestion.QuestionVisualization;
InteractiveQuestion.SaveQuestionForm = SdkQuestion.SaveQuestionForm;
InteractiveQuestion.SaveButton = SdkQuestion.SaveButton;
InteractiveQuestion.ChartTypeSelector = SdkQuestion.ChartTypeSelector;
InteractiveQuestion.QuestionSettings = SdkQuestion.QuestionSettings;
InteractiveQuestion.QuestionSettingsDropdown =
  SdkQuestion.QuestionSettingsDropdown;
InteractiveQuestion.BreakoutDropdown = SdkQuestion.BreakoutDropdown;
InteractiveQuestion.Breakout = SdkQuestion.Breakout;
InteractiveQuestion.ChartTypeDropdown = SdkQuestion.ChartTypeDropdown;
InteractiveQuestion.DownloadWidget = SdkQuestion.DownloadWidget;
InteractiveQuestion.DownloadWidgetDropdown = SdkQuestion.DownloadWidgetDropdown;
InteractiveQuestion.VisualizationButton = SdkQuestion.VisualizationButton;
