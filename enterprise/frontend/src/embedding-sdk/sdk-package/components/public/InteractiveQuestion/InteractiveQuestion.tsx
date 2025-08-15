import type { InteractiveQuestionComponents } from "embedding-sdk/components/public/InteractiveQuestion/InteractiveQuestion";
import { createComponent } from "embedding-sdk/sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

const _InteractiveQuestion = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion,
);

const subComponents: InteractiveQuestionComponents = {
  BackButton: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.BackButton,
  ),
  Filter: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Filter,
  ),
  FilterDropdown: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.FilterDropdown,
  ),
  ResetButton: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.ResetButton,
  ),
  Title: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Title,
  ),
  Summarize: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Summarize,
  ),
  SummarizeDropdown: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.SummarizeDropdown,
  ),
  Notebook: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Editor,
  ),
  Editor: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Editor,
  ),
  NotebookButton: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.EditorButton,
  ),
  EditorButton: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.EditorButton,
  ),
  QuestionVisualization: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion
        ?.QuestionVisualization,
  ),
  SaveQuestionForm: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.SaveQuestionForm,
  ),
  SaveButton: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.SaveButton,
  ),
  ChartTypeSelector: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.ChartTypeSelector,
  ),
  QuestionSettings: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.QuestionSettings,
  ),
  QuestionSettingsDropdown: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion
        ?.QuestionSettingsDropdown,
  ),
  BreakoutDropdown: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.BreakoutDropdown,
  ),
  Breakout: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.Breakout,
  ),
  ChartTypeDropdown: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.ChartTypeDropdown,
  ),
  DownloadWidget: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion?.DownloadWidget,
  ),
  DownloadWidgetDropdown: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion
        ?.DownloadWidgetDropdown,
  ),
  VisualizationButton: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.InteractiveQuestion
        ?.VisualizationButton,
  ),
};

/**
 * A component that renders an interactive question.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const InteractiveQuestion = Object.assign(
  _InteractiveQuestion,
  subComponents,
);
