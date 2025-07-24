import type { InteractiveQuestionComponents } from "embedding-sdk/components/public/InteractiveQuestion/InteractiveQuestion";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

const _InteractiveQuestion = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion,
);

/**
 * A component that renders an interactive question.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const InteractiveQuestion =
  _InteractiveQuestion as typeof _InteractiveQuestion &
    InteractiveQuestionComponents;

InteractiveQuestion.BackButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.BackButton,
);
InteractiveQuestion.Filter = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Filter,
);
InteractiveQuestion.FilterDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.FilterDropdown,
);
InteractiveQuestion.ResetButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.ResetButton,
);
InteractiveQuestion.Title = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Title,
);
InteractiveQuestion.Summarize = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Summarize,
);
InteractiveQuestion.SummarizeDropdown = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.SummarizeDropdown,
);
InteractiveQuestion.Notebook = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Editor,
);
InteractiveQuestion.Editor = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Editor,
);
InteractiveQuestion.NotebookButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.EditorButton,
);
InteractiveQuestion.EditorButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.EditorButton,
);
InteractiveQuestion.QuestionVisualization = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion
      ?.QuestionVisualization,
);
InteractiveQuestion.SaveQuestionForm = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.SaveQuestionForm,
);
InteractiveQuestion.SaveButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.SaveButton,
);
InteractiveQuestion.ChartTypeSelector = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.ChartTypeSelector,
);
InteractiveQuestion.QuestionSettings = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.QuestionSettings,
);
InteractiveQuestion.QuestionSettingsDropdown = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion
      ?.QuestionSettingsDropdown,
);
InteractiveQuestion.BreakoutDropdown = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.BreakoutDropdown,
);
InteractiveQuestion.Breakout = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Breakout,
);
InteractiveQuestion.ChartTypeDropdown = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.ChartTypeDropdown,
);
InteractiveQuestion.DownloadWidget = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.DownloadWidget,
);
InteractiveQuestion.DownloadWidgetDropdown = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion
      ?.DownloadWidgetDropdown,
);
InteractiveQuestion.VisualizationButton = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.VisualizationButton,
);
