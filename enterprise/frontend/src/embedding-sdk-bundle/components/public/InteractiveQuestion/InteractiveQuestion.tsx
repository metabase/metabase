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
  Summarize,
  SummarizeDropdown,
  Title,
  VisualizationButton,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components";
import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";

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

/**
 * A question component with drill-downs enabled.
 *
 * @function
 * @category InteractiveQuestion
 */
export const InteractiveQuestion =
  _InteractiveQuestion as typeof _InteractiveQuestion & {
    BackButton: typeof BackButton;
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
  };

InteractiveQuestion.BackButton = BackButton;
InteractiveQuestion.Filter = Filter;
InteractiveQuestion.FilterDropdown = FilterDropdown;
InteractiveQuestion.ResetButton = QuestionResetButton;
InteractiveQuestion.Title = Title;
InteractiveQuestion.Summarize = Summarize;
InteractiveQuestion.SummarizeDropdown = SummarizeDropdown;
InteractiveQuestion.Notebook = Editor;
InteractiveQuestion.Editor = Editor;
InteractiveQuestion.NotebookButton = EditorButton;
InteractiveQuestion.EditorButton = EditorButton;
InteractiveQuestion.QuestionVisualization = QuestionVisualization;
InteractiveQuestion.SaveQuestionForm = SdkSaveQuestionForm;
InteractiveQuestion.SaveButton = SaveButton;
InteractiveQuestion.ChartTypeSelector = ChartTypeSelector;
InteractiveQuestion.QuestionSettings = QuestionSettings;
InteractiveQuestion.QuestionSettingsDropdown = QuestionSettingsDropdown;
InteractiveQuestion.BreakoutDropdown = BreakoutDropdown;
InteractiveQuestion.Breakout = Breakout;
InteractiveQuestion.ChartTypeDropdown = ChartTypeDropdown;
InteractiveQuestion.DownloadWidget = DownloadWidget;
InteractiveQuestion.DownloadWidgetDropdown = DownloadWidgetDropdown;
InteractiveQuestion.VisualizationButton = VisualizationButton;
