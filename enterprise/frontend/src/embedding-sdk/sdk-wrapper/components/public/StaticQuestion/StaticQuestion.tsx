import type { StaticQuestionComponents } from "embedding-sdk/components/public/StaticQuestion/StaticQuestion";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

export const _StaticQuestion = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion,
);

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = _StaticQuestion as typeof _StaticQuestion &
  StaticQuestionComponents;

StaticQuestion.Filter = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.Filter,
);
StaticQuestion.FilterDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.FilterDropdown,
);
StaticQuestion.ResetButton = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.ResetButton,
);
StaticQuestion.Title = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.Title,
);
StaticQuestion.Summarize = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.Summarize,
);
StaticQuestion.SummarizeDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.SummarizeDropdown,
);
StaticQuestion.QuestionVisualization = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.QuestionVisualization,
);
StaticQuestion.ChartTypeSelector = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.ChartTypeSelector,
);
StaticQuestion.ChartTypeDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.ChartTypeDropdown,
);
StaticQuestion.QuestionSettings = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.QuestionSettings,
);
StaticQuestion.QuestionSettingsDropdown = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.QuestionSettingsDropdown,
);
StaticQuestion.Breakout = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.Breakout,
);
StaticQuestion.BreakoutDropdown = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.BreakoutDropdown,
);
StaticQuestion.DownloadWidget = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.DownloadWidget,
);
StaticQuestion.DownloadWidgetDropdown = createComponent(
  () =>
    getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.DownloadWidgetDropdown,
);
