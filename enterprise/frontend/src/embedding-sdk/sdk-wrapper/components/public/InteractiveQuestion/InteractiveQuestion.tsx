import type { InteractiveQuestionComponents } from "embedding-sdk/components/public/InteractiveQuestion/InteractiveQuestion";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

const _InteractiveQuestion = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion,
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
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.BackButton,
);
InteractiveQuestion.Filter = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.Filter,
);
InteractiveQuestion.FilterDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.FilterDropdown,
);
InteractiveQuestion.ResetButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.ResetButton,
);
InteractiveQuestion.Title = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.Title,
);
InteractiveQuestion.Summarize = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.Summarize,
);
InteractiveQuestion.SummarizeDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.SummarizeDropdown,
);
InteractiveQuestion.Notebook = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.Editor,
);
InteractiveQuestion.Editor = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.Editor,
);
InteractiveQuestion.NotebookButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.EditorButton,
);
InteractiveQuestion.EditorButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.EditorButton,
);
InteractiveQuestion.QuestionVisualization = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.QuestionVisualization,
);
InteractiveQuestion.SaveQuestionForm = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.SaveQuestionForm,
);
InteractiveQuestion.SaveButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.SaveButton,
);
InteractiveQuestion.ChartTypeSelector = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.ChartTypeSelector,
);
InteractiveQuestion.QuestionSettings = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.QuestionSettings,
);
InteractiveQuestion.QuestionSettingsDropdown = createComponent(
  () =>
    window.MetabaseEmbeddingSDK?.InteractiveQuestion?.QuestionSettingsDropdown,
);
InteractiveQuestion.BreakoutDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.BreakoutDropdown,
);
InteractiveQuestion.Breakout = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.Breakout,
);
InteractiveQuestion.ChartTypeDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.ChartTypeDropdown,
);
InteractiveQuestion.DownloadWidget = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.DownloadWidget,
);
InteractiveQuestion.DownloadWidgetDropdown = createComponent(
  () =>
    window.MetabaseEmbeddingSDK?.InteractiveQuestion?.DownloadWidgetDropdown,
);
InteractiveQuestion.VisualizationButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.InteractiveQuestion?.VisualizationButton,
);
