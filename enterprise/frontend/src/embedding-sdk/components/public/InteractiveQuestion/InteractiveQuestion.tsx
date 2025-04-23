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
 * @interface
 * @expand
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
 * Props for the drill-through question
 *
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type DrillThroughQuestionProps = Omit<
  BaseInteractiveQuestionProps,
  "questionId"
> &
  InteractiveQuestionDefaultViewProps;

/**
 * @interface
 * @expand
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

export { InteractiveQuestion };
