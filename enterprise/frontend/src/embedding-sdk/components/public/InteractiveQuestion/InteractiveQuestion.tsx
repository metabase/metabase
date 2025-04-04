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
 * @group InteractiveQuestion
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
 * @group InteractiveQuestion
 * @param props
 */
const InteractiveQuestion = withPublicComponentWrapper(
  _InteractiveQuestion,
) as typeof _InteractiveQuestion & {
  BackButton: typeof BackButton;
  Filter: typeof Filter;
  FilterDropdown: typeof FilterDropdown;
  ResetButton: typeof QuestionResetButton;
  Title: typeof Title;
  Summarize: typeof Summarize;
  SummarizeDropdown: typeof SummarizeDropdown;
  Notebook: typeof Editor;
  Editor: typeof Editor;
  NotebookButton: typeof EditorButton;
  EditorButton: typeof EditorButton;
  QuestionVisualization: typeof QuestionVisualization;
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

/**
 * @function
 */
InteractiveQuestion.BackButton = BackButton;

/**
 * @function
 */
InteractiveQuestion.Filter = Filter;

/**
 * @function
 */
InteractiveQuestion.FilterDropdown = FilterDropdown;

/**
 * @function
 */
InteractiveQuestion.ResetButton = QuestionResetButton;

/**
 * @function
 */
InteractiveQuestion.Title = Title;

/**
 * @function
 */
InteractiveQuestion.Summarize = Summarize;

/**
 * @function
 */
InteractiveQuestion.SummarizeDropdown = SummarizeDropdown;

/**
 * @function
 * @deprecated Use `InteractiveQuestion.Editor` instead
 */
InteractiveQuestion.Notebook = Editor;

/**
 * @function
 */
InteractiveQuestion.Editor = Editor;

/**
 * @function
 * @deprecated Use `InteractiveQuestion.EditorButton` instead
 **/
InteractiveQuestion.NotebookButton = EditorButton;

/**
 * @function
 */
InteractiveQuestion.EditorButton = EditorButton;

/**
 * @function
 */
InteractiveQuestion.QuestionVisualization = QuestionVisualization;

/**
 * @function
 */
InteractiveQuestion.SaveQuestionForm = SdkSaveQuestionForm;

/**
 * @function
 */
InteractiveQuestion.SaveButton = SaveButton;

/**
 * @function
 */
InteractiveQuestion.ChartTypeSelector = ChartTypeSelector;

/**
 * @function
 */
InteractiveQuestion.QuestionSettings = QuestionSettings;

/**
 * @function
 */
InteractiveQuestion.QuestionSettingsDropdown = QuestionSettingsDropdown;

/**
 * @function
 */
InteractiveQuestion.BreakoutDropdown = BreakoutDropdown;

/**
 * @function
 */
InteractiveQuestion.Breakout = Breakout;

/**
 * @function
 */
InteractiveQuestion.ChartTypeDropdown = ChartTypeDropdown;

/**
 * @function
 */
InteractiveQuestion.DownloadWidget = DownloadWidget;

/**
 * @function
 */
InteractiveQuestion.DownloadWidgetDropdown = DownloadWidgetDropdown;

export { InteractiveQuestion };
