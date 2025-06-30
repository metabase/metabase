import type { InteractiveQuestionComponents } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

const _SdkQuestion = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion,
);

/**
 * A component that renders an interactive question.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const SdkQuestion = _SdkQuestion as typeof _SdkQuestion &
  InteractiveQuestionComponents;

SdkQuestion.BackButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.BackButton,
);
SdkQuestion.Filter = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.Filter,
);
SdkQuestion.FilterDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.FilterDropdown,
);
SdkQuestion.ResetButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.ResetButton,
);
SdkQuestion.Title = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.Title,
);
SdkQuestion.Summarize = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.Summarize,
);
SdkQuestion.SummarizeDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.SummarizeDropdown,
);
SdkQuestion.Notebook = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.Editor,
);
SdkQuestion.Editor = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.Editor,
);
SdkQuestion.NotebookButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.EditorButton,
);
SdkQuestion.EditorButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.EditorButton,
);
SdkQuestion.QuestionVisualization = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.QuestionVisualization,
);
SdkQuestion.SaveQuestionForm = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.SaveQuestionForm,
);
SdkQuestion.SaveButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.SaveButton,
);
SdkQuestion.ChartTypeSelector = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.ChartTypeSelector,
);
SdkQuestion.QuestionSettings = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.QuestionSettings,
);
SdkQuestion.QuestionSettingsDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.QuestionSettingsDropdown,
);
SdkQuestion.BreakoutDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.BreakoutDropdown,
);
SdkQuestion.Breakout = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.Breakout,
);
SdkQuestion.ChartTypeDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.ChartTypeDropdown,
);
SdkQuestion.DownloadWidget = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.DownloadWidget,
);
SdkQuestion.DownloadWidgetDropdown = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.DownloadWidgetDropdown,
);
SdkQuestion.VisualizationButton = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkQuestion?.VisualizationButton,
);
