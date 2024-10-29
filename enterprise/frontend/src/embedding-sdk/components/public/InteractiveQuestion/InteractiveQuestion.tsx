import type { PropsWithChildren } from "react";

import {
  BackButton,
  ChartTypeSelector,
  Editor,
  EditorButton,
  Filter,
  FilterBar,
  FilterButton,
  QuestionResetButton,
  QuestionVisualization,
  SaveButton,
  SdkSaveQuestionForm,
  Summarize,
  SummarizeButton,
  Title,
} from "embedding-sdk/components/private/InteractiveQuestion/components";
import {
  InteractiveQuestionProvider,
  type InteractiveQuestionProviderProps,
} from "embedding-sdk/components/private/InteractiveQuestion/context";
import {
  InteractiveQuestionResult,
  type InteractiveQuestionResultProps,
} from "embedding-sdk/components/private/InteractiveQuestionResult";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import type { FlexibleSizeProps } from "embedding-sdk/components/private/util/FlexibleSizeComponent";

export type InteractiveQuestionProps = PropsWithChildren<{
  questionId?: InteractiveQuestionProviderProps["cardId"];
  plugins?: InteractiveQuestionProviderProps["componentPlugins"];
}> &
  Pick<
    InteractiveQuestionProviderProps,
    "onBeforeSave" | "onSave" | "isSaveEnabled" | "entityTypeFilter"
  >;

export const _InteractiveQuestion = ({
  questionId,
  withResetButton = true,
  withTitle = false,
  customTitle,
  plugins,
  height,
  width,
  className,
  style,
  children = null,
  onBeforeSave,
  onSave,
  isSaveEnabled,
  entityTypeFilter,
}: InteractiveQuestionProps &
  InteractiveQuestionResultProps &
  FlexibleSizeProps): JSX.Element | null => (
  <InteractiveQuestionProvider
    cardId={questionId}
    componentPlugins={plugins}
    onBeforeSave={onBeforeSave}
    onSave={onSave}
    isSaveEnabled={isSaveEnabled}
    entityTypeFilter={entityTypeFilter}
  >
    {children ?? (
      <InteractiveQuestionResult
        height={height}
        width={width}
        className={className}
        style={style}
        customTitle={customTitle}
        withResetButton={withResetButton}
        withTitle={withTitle}
      />
    )}
  </InteractiveQuestionProvider>
);

const InteractiveQuestion = withPublicComponentWrapper(
  _InteractiveQuestion,
) as typeof _InteractiveQuestion & {
  BackButton: typeof BackButton;
  FilterBar: typeof FilterBar;
  Filter: typeof Filter;
  FilterButton: typeof FilterButton;
  ResetButton: typeof QuestionResetButton;
  Title: typeof Title;
  Summarize: typeof Summarize;
  SummarizeButton: typeof SummarizeButton;
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
};

InteractiveQuestion.BackButton = BackButton;
InteractiveQuestion.FilterBar = FilterBar;
InteractiveQuestion.Filter = Filter;
InteractiveQuestion.FilterButton = FilterButton;
InteractiveQuestion.ResetButton = QuestionResetButton;
InteractiveQuestion.Title = Title;
InteractiveQuestion.Summarize = Summarize;
InteractiveQuestion.SummarizeButton = SummarizeButton;
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

export { InteractiveQuestion };
