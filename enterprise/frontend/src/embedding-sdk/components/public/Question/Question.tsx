import type { ReactNode } from "react";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
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
} from "embedding-sdk/components/private/Question/components";
import { VisualizationButton } from "embedding-sdk/components/private/Question/components/VisualizationButton/VisualizationButton";
import {
  QuestionProvider,
  type QuestionProviderProps,
} from "embedding-sdk/components/private/Question/context";
import {
  type QuestionDefaultViewProps as BaseQuestionDefaultViewProps,
  QuestionDefaultView,
} from "embedding-sdk/components/private/QuestionDefaultView";
import type { QuestionQuestionIdProps } from "embedding-sdk/components/public/Question/types";

/**
 * @interface
 * @expand
 */
export type BaseQuestionProps = QuestionQuestionIdProps & {
  /**
   * The children of the MetabaseProvider component.s
   */
  children?: ReactNode;
  plugins?: QuestionProviderProps["componentPlugins"];
} & Pick<
    QuestionProviderProps,
    | "onBeforeSave"
    | "onSave"
    | "entityTypes"
    | "isSaveEnabled"
    | "initialSqlParameters"
    | "withDownloads"
    | "targetCollection"
    | "onRun"
  >;

/**
 * Props for the drill-through question
 *
 * @interface
 * @expand
 * @category Question
 */
export type DrillThroughQuestionProps = Omit<BaseQuestionProps, "questionId"> &
  BaseQuestionDefaultViewProps;

/**
 * @interface
 * @expand
 * @category Question
 */
export type QuestionProps = BaseQuestionProps & BaseQuestionDefaultViewProps;

export const _Question = ({
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
  entityTypes,
  isSaveEnabled,
  targetCollection,
  withChartTypeSelector = true,
  withDownloads = false,
  initialSqlParameters,
  onRun,
}: QuestionProps): JSX.Element | null => (
  <QuestionProvider
    questionId={questionId}
    componentPlugins={plugins}
    onBeforeSave={onBeforeSave}
    onSave={onSave}
    entityTypes={entityTypes}
    isSaveEnabled={isSaveEnabled}
    targetCollection={targetCollection}
    initialSqlParameters={initialSqlParameters}
    withDownloads={withDownloads}
    onRun={onRun}
  >
    {children ?? (
      <QuestionDefaultView
        height={height}
        width={width}
        className={className}
        style={style}
        title={title}
        withResetButton={withResetButton}
        withChartTypeSelector={withChartTypeSelector}
      />
    )}
  </QuestionProvider>
);

/**
 * A component that renders an interactive question.
 *
 * @function
 * @category Question
 * @param props
 */
const Question = withPublicComponentWrapper(_Question) as typeof _Question & {
  BackButton: typeof BackButton;
  Filter: typeof Filter;
  FilterDropdown: typeof FilterDropdown;
  ResetButton: typeof QuestionResetButton;
  Title: typeof Title;
  Summarize: typeof Summarize;
  SummarizeDropdown: typeof SummarizeDropdown;
  /** @deprecated Use `Question.Editor` instead */
  Notebook: typeof Editor;
  Editor: typeof Editor;
  /** @deprecated Use `Question.EditorButton` instead */
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

Question.BackButton = BackButton;
Question.Filter = Filter;
Question.FilterDropdown = FilterDropdown;
Question.ResetButton = QuestionResetButton;
Question.Title = Title;
Question.Summarize = Summarize;
Question.SummarizeDropdown = SummarizeDropdown;
Question.Notebook = Editor;
Question.Editor = Editor;
Question.NotebookButton = EditorButton;
Question.EditorButton = EditorButton;
Question.QuestionVisualization = QuestionVisualization;
Question.SaveQuestionForm = SdkSaveQuestionForm;
Question.SaveButton = SaveButton;
Question.ChartTypeSelector = ChartTypeSelector;
Question.QuestionSettings = QuestionSettings;
Question.QuestionSettingsDropdown = QuestionSettingsDropdown;
Question.BreakoutDropdown = BreakoutDropdown;
Question.Breakout = Breakout;
Question.ChartTypeDropdown = ChartTypeDropdown;
Question.DownloadWidget = DownloadWidget;
Question.DownloadWidgetDropdown = DownloadWidgetDropdown;
Question.VisualizationButton = VisualizationButton;

export { Question };
