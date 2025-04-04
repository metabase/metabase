import type { ReactNode } from "react";

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
} from "embedding-sdk/components/private/InteractiveQuestion/components";
import {
  InteractiveQuestionProvider,
  type InteractiveQuestionProviderProps,
} from "embedding-sdk/components/private/InteractiveQuestion/context";
import {
  InteractiveQuestionDefaultView,
  type InteractiveQuestionDefaultViewProps,
} from "embedding-sdk/components/private/InteractiveQuestionDefaultView";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import type { InteractiveQuestionQuestionIdProps } from "embedding-sdk/components/public/InteractiveQuestion/types";

/**
 * @hidden
 */
export type BaseInteractiveQuestionProps =
  InteractiveQuestionQuestionIdProps & {
    /**
     * The children of the MetabaseProvider component.s
     */
    children?: ReactNode;
    plugins?: InteractiveQuestionProviderProps["componentPlugins"];
  } & Pick<
      InteractiveQuestionProviderProps,
      | "onBeforeSave"
      | "onSave"
      | "entityTypeFilter"
      | "isSaveEnabled"
      | "initialSqlParameters"
      | "withDownloads"
      | "targetCollection"
    >;

/**
 * @interface
 * @category InteractiveQuestion
 */
export type InteractiveQuestionProps = BaseInteractiveQuestionProps &
  InteractiveQuestionDefaultViewProps;

export const _InteractiveQuestion = ({
  questionId,
  withResetButton = true,
  title,
  plugins,
  height,
  width,
  className,
  style,
  children = null,
  onBeforeSave,
  onSave,
  entityTypeFilter,
  isSaveEnabled,
  targetCollection,
  withChartTypeSelector = true,
  withDownloads = false,
  initialSqlParameters,
}: InteractiveQuestionProps): JSX.Element | null => (
  <InteractiveQuestionProvider
    questionId={questionId}
    componentPlugins={plugins}
    onBeforeSave={onBeforeSave}
    onSave={onSave}
    entityTypeFilter={entityTypeFilter}
    isSaveEnabled={isSaveEnabled}
    targetCollection={targetCollection}
    initialSqlParameters={initialSqlParameters}
    withDownloads={withDownloads}
  >
    {children ?? (
      <InteractiveQuestionDefaultView
        height={height}
        width={width}
        className={className}
        style={style}
        title={title}
        withResetButton={withResetButton}
        withChartTypeSelector={withChartTypeSelector}
      />
    )}
  </InteractiveQuestionProvider>
);

/**
 * A component that renders an interactive question.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
const InteractiveQuestion = withPublicComponentWrapper(
  _InteractiveQuestion,
) as typeof _InteractiveQuestion & {
  /**
   * A navigation button that returns to the previous view.
   * Only visible when rendered within the {@link InteractiveDashboardProps.renderDrillThroughQuestion} prop.
   *
   * @function
   */
  BackButton: typeof BackButton;

  /**
   * A set of interactive filter badges that allow adding, editing, and removing filters.
   * Displays current filters as badges with an "Add another filter" option.
   *
   * @function
   */
  Filter: typeof Filter;

  /**
   * A dropdown button for the Filter component.
   *
   * @function
   */
  FilterDropdown: typeof FilterDropdown;

  /**
   * Button to reset question modifications. Only appears when there are unsaved changes to the question.
   *
   * @function
   */
  ResetButton: typeof QuestionResetButton;

  /**
   * Displays a title based on the question's state. Shows:
   *
   * - The question's display name if it's saved
   * - An auto-generated description for ad-hoc questions (non-native queries)
   * - "New question" as fallback or for new/native queries
   *
   * @function
   */
  Title: typeof Title;

  /**
   * Interface for adding and managing data summaries (like counts, sums, averages). Displays as a set of badges.
   * No props. Uses question context for summarization functionality.
   *
   * @function
   */
  Summarize: typeof Summarize;

  /**
   * Dropdown button for the Summarize component.
   *
   * @function
   */
  SummarizeDropdown: typeof SummarizeDropdown;

  /**
   * @function
   * @deprecated Use `InteractiveQuestion.Editor` instead
   */
  Notebook: typeof Editor;

  /**
   * Advanced query editor that provides full access to question configuration.
   * Includes filtering, aggregation, custom expressions, and joins.
   *
   * @function
   */
  Editor: typeof Editor;

  /**
   * @function
   * @deprecated Use `InteractiveQuestion.EditorButton` instead
   */
  NotebookButton: typeof EditorButton;

  /**
   * Toggle button for showing/hiding the Editor interface.
   * In custom layouts, the `EditorButton` _must_ have an {@link InteractiveQuestionEditorButtonProps.onClick}` handler or the button won't do anything when clicked.
   *
   * @function
   */
  EditorButton: typeof EditorButton;

  /**
   * The main visualization component that renders the question results as a chart, table, or other visualization type.
   *
   * @function
   */
  QuestionVisualization: typeof QuestionVisualization;

  /**
   * Form for saving a question, including title and description. When saved:
   *
   * - For existing questions: Calls {@link InteractiveQuestionProps.onSave}
   * - Both callbacks receive the updated question object
   * - Form can be cancelled via the {@link InteractiveQuestionSaveQuestionFormProps.onCancel}
   *
   * @function
   */
  SaveQuestionForm: typeof SdkSaveQuestionForm;

  /**
   * Button for saving question changes. Only enabled when there are unsaved modifications to the question.
   *
   * _Note_: Currently, in custom layouts, the `SaveButton` must have an `onClick` handler or the button will not do anything when clicked.
   *
   * @function
   */
  SaveButton: typeof SaveButton;

  /**
   * Detailed chart type selection interface with recommended visualization options.
   *
   * @function
   */
  ChartTypeSelector: typeof ChartTypeSelector;

  /**
   * Dropdown for selecting the visualization type (bar chart, line chart, table, etc.).
   * Automatically updates to show recommended visualization types for the current data.
   *
   * @function
   */
  ChartTypeDropdown: typeof ChartTypeDropdown;

  /**
   * Settings panel for configuring visualization options like axes, colors, and formatting.
   * No props. Uses question context for settings.
   *
   * @function
   */
  QuestionSettings: typeof QuestionSettings;

  /**
   * Dropdown button that contains the QuestionSettings component.
   *
   * @function
   */
  QuestionSettingsDropdown: typeof QuestionSettingsDropdown;

  /**
   * A set of badges for managing data groupings (breakouts).
   * No props. Uses question context for breakout functionality.
   *
   * @function
   */
  Breakout: typeof Breakout;

  /**
   * Dropdown button for the Breakout component.
   *
   * @function
   */
  BreakoutDropdown: typeof BreakoutDropdown;

  /**
   * Provides a UI widget for downloading data in different formats (`CSV`, `XLSX`, `JSON`, and `PNG` depending on the visualization).
   *
   * @function
   */
  DownloadWidget: typeof DownloadWidget;

  /**
   * Provides a button that contains a dropdown that shows the `DownloadWidget`.
   *
   * @function
   */
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

export { InteractiveQuestion };
