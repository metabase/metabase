import type { StaticQuestionComponents } from "embedding-sdk/components/public/StaticQuestion/StaticQuestion";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

export const _StaticQuestion = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion,
);

const subComponents: StaticQuestionComponents = {
  Filter: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.Filter,
  ),
  FilterDropdown: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.FilterDropdown,
  ),
  ResetButton: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.ResetButton,
  ),
  Title: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.Title,
  ),
  Summarize: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.Summarize,
  ),
  SummarizeDropdown: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.SummarizeDropdown,
  ),
  QuestionVisualization: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.QuestionVisualization,
  ),
  ChartTypeSelector: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.ChartTypeSelector,
  ),
  ChartTypeDropdown: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.ChartTypeDropdown,
  ),
  QuestionSettings: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.QuestionSettings,
  ),
  QuestionSettingsDropdown: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion
        ?.QuestionSettingsDropdown,
  ),
  Breakout: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.Breakout,
  ),
  BreakoutDropdown: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.BreakoutDropdown,
  ),
  DownloadWidget: createComponent(
    () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.DownloadWidget,
  ),
  DownloadWidgetDropdown: createComponent(
    () =>
      getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion?.DownloadWidgetDropdown,
  ),
};

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = Object.assign(_StaticQuestion, subComponents);
