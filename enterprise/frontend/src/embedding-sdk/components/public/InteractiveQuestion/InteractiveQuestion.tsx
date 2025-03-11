import type { PropsWithChildren } from "react";

import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import {
  BackButton,
  Breakout,
  BreakoutDropdown,
  ChartTypeDropdown,
  ChartTypeSelector,
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
import type { SDKCollectionReference } from "embedding-sdk/store/collections";
import type { SaveQuestionProps } from "metabase/components/SaveQuestionForm/types";

export type InteractiveQuestionProps = PropsWithChildren<{
  questionId: InteractiveQuestionProviderProps["questionId"];
  plugins?: InteractiveQuestionProviderProps["componentPlugins"];
}> &
  Pick<SaveQuestionProps<SDKCollectionReference>, "targetCollection"> &
  Pick<
    InteractiveQuestionProviderProps,
    | "questionId"
    | "onBeforeSave"
    | "onSave"
    | "entityTypeFilter"
    | "isSaveEnabled"
    | "initialSqlParameters"
  >;

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
  initialSqlParameters,
}: InteractiveQuestionProps &
  InteractiveQuestionDefaultViewProps &
  FlexibleSizeProps): JSX.Element | null => (
  <InteractiveQuestionProvider
    questionId={questionId}
    componentPlugins={plugins}
    onBeforeSave={onBeforeSave}
    onSave={onSave}
    entityTypeFilter={entityTypeFilter}
    isSaveEnabled={isSaveEnabled}
    targetCollection={targetCollection}
    initialSqlParameters={initialSqlParameters}
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
};

InteractiveQuestion.BackButton = BackButton;
InteractiveQuestion.Filter = Filter;
InteractiveQuestion.FilterDropdown = FilterDropdown;
InteractiveQuestion.ResetButton = QuestionResetButton;
InteractiveQuestion.Title = Title;
InteractiveQuestion.Summarize = Summarize;
InteractiveQuestion.SummarizeDropdown = SummarizeDropdown;
/** @deprecated Use `InteractiveQuestion.Editor` instead */
InteractiveQuestion.Notebook = Editor;
InteractiveQuestion.Editor = Editor;
/** @deprecated Use `InteractiveQuestion.EditorButton` instead */
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

export { InteractiveQuestion };
