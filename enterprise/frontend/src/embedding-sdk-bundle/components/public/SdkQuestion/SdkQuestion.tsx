import type { ReactNode } from "react";

import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
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
  SdkQuestionProvider,
  type SdkQuestionProviderProps,
} from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import {
  SdkQuestionDefaultView,
  type SdkQuestionDefaultViewProps,
} from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";

import type { SdkQuestionIdProps } from "./types";

/**
 * @interface
 * @expand
 */
export type BaseSdkQuestionProps = SdkQuestionIdProps & {
  /**
   * The children of the component
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
export type SdkQuestionProps = SdkQuestionProviderProps &
  SdkQuestionDefaultViewProps &
  Omit<SdkQuestionProviderProps, "componentPlugins"> & {
    plugins?: SdkQuestionProviderProps["componentPlugins"];
  };

/**
 * @interface
 */
export type SdkQuestionComponents = {
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

export const _SdkQuestion = ({
  questionId,
  options,
  deserializedCard,
  plugins,
  onNavigateBack,
  children = null,
  onBeforeSave,
  onSave,
  onRun,
  isSaveEnabled = true,
  entityTypes,
  targetCollection,
  initialSqlParameters,
  withDownloads = false,
  targetDashboardId,
  backToDashboard,
  getClickActionMode,
  navigateToNewCard,

  height,
  width,
  className,
  style,
  title,
  withResetButton = true,
  withChartTypeSelector = true,
  onVisualizationChange,
}: SdkQuestionProps): JSX.Element | null => (
  <SdkQuestionProvider
    questionId={questionId}
    options={options}
    deserializedCard={deserializedCard}
    componentPlugins={plugins}
    onNavigateBack={onNavigateBack}
    onBeforeSave={onBeforeSave}
    onSave={onSave}
    onRun={onRun}
    isSaveEnabled={isSaveEnabled}
    entityTypes={entityTypes}
    targetCollection={targetCollection}
    initialSqlParameters={initialSqlParameters}
    withDownloads={withDownloads}
    targetDashboardId={targetDashboardId}
    backToDashboard={backToDashboard}
    getClickActionMode={getClickActionMode}
    navigateToNewCard={navigateToNewCard}
    onVisualizationChange={onVisualizationChange}
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

const subComponents: SdkQuestionComponents = {
  BackButton: BackButton,
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
  VisualizationButton: VisualizationButton,
};

export const SdkQuestion = Object.assign(
  withPublicComponentWrapper(_SdkQuestion),
  subComponents,
);
