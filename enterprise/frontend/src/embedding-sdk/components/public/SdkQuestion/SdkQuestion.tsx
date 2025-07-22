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
  VisualizationButton,
} from "embedding-sdk/components/private/SdkQuestion/components";
import {
  SdkQuestionProvider,
  type SdkQuestionProviderProps,
} from "embedding-sdk/components/private/SdkQuestion/context";
import {
  SdkQuestionDefaultView,
  type SdkQuestionDefaultViewProps,
} from "embedding-sdk/components/private/SdkQuestionDefaultView";

import type { SdkQuestionIdProps } from "./types";

/**
 * @interface
 * @expand
 */
export type BaseSdkQuestionProps = SdkQuestionIdProps & {
  /**
   * The children of the MetabaseProvider component.s
   */
  children?: ReactNode;
  plugins?: SdkQuestionProviderProps["componentPlugins"];
} & Pick<
    SdkQuestionProviderProps,
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
 * @category InteractiveQuestion
 */
export type DrillThroughQuestionProps = Omit<
  BaseSdkQuestionProps,
  "questionId"
> &
  SdkQuestionDefaultViewProps;

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type SdkQuestionProps = BaseSdkQuestionProps &
  SdkQuestionDefaultViewProps;

export const _SdkQuestion = ({
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
}: SdkQuestionProps): JSX.Element | null => (
  <SdkQuestionProvider
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
      <SdkQuestionDefaultView
        height={height}
        width={width}
        className={className}
        style={style}
        title={title}
        withResetButton={withResetButton}
        withChartTypeSelector={withChartTypeSelector}
      />
    )}
  </SdkQuestionProvider>
);

/**
 * A component that renders an interactive question.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
const SdkQuestion = withPublicComponentWrapper(
  _SdkQuestion,
) as typeof _SdkQuestion & {
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

SdkQuestion.BackButton = BackButton;
SdkQuestion.Filter = Filter;
SdkQuestion.FilterDropdown = FilterDropdown;
SdkQuestion.ResetButton = QuestionResetButton;
SdkQuestion.Title = Title;
SdkQuestion.Summarize = Summarize;
SdkQuestion.SummarizeDropdown = SummarizeDropdown;
SdkQuestion.Notebook = Editor;
SdkQuestion.Editor = Editor;
SdkQuestion.NotebookButton = EditorButton;
SdkQuestion.EditorButton = EditorButton;
SdkQuestion.QuestionVisualization = QuestionVisualization;
SdkQuestion.SaveQuestionForm = SdkSaveQuestionForm;
SdkQuestion.SaveButton = SaveButton;
SdkQuestion.ChartTypeSelector = ChartTypeSelector;
SdkQuestion.QuestionSettings = QuestionSettings;
SdkQuestion.QuestionSettingsDropdown = QuestionSettingsDropdown;
SdkQuestion.BreakoutDropdown = BreakoutDropdown;
SdkQuestion.Breakout = Breakout;
SdkQuestion.ChartTypeDropdown = ChartTypeDropdown;
SdkQuestion.DownloadWidget = DownloadWidget;
SdkQuestion.DownloadWidgetDropdown = DownloadWidgetDropdown;
SdkQuestion.VisualizationButton = VisualizationButton;

export { SdkQuestion };
