import type { InteractiveQuestionComponents } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

const _SdkQuestion = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion,
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
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.BackButton,
);
SdkQuestion.Filter = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.Filter,
);
SdkQuestion.FilterDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.FilterDropdown,
);
SdkQuestion.ResetButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.ResetButton,
);
SdkQuestion.Title = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.Title,
);
SdkQuestion.Summarize = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.Summarize,
);
SdkQuestion.SummarizeDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.SummarizeDropdown,
);
SdkQuestion.Notebook = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.Editor,
);
SdkQuestion.Editor = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.Editor,
);
SdkQuestion.NotebookButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.EditorButton,
);
SdkQuestion.EditorButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.EditorButton,
);
SdkQuestion.QuestionVisualization = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.QuestionVisualization,
);
SdkQuestion.SaveQuestionForm = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.SaveQuestionForm,
);
SdkQuestion.SaveButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.SaveButton,
);
SdkQuestion.ChartTypeSelector = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.ChartTypeSelector,
);
SdkQuestion.QuestionSettings = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.QuestionSettings,
);
SdkQuestion.QuestionSettingsDropdown = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.QuestionSettingsDropdown,
);
SdkQuestion.BreakoutDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.BreakoutDropdown,
);
SdkQuestion.Breakout = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.Breakout,
);
SdkQuestion.ChartTypeDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.ChartTypeDropdown,
);
SdkQuestion.DownloadWidget = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.DownloadWidget,
);
SdkQuestion.DownloadWidgetDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.DownloadWidgetDropdown,
);
SdkQuestion.VisualizationButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkQuestion?.VisualizationButton,
);
