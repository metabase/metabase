import type { StaticQuestionComponents } from "embedding-sdk-bundle/components/public/StaticQuestion/StaticQuestion";
import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

const _StaticQuestion = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion,
);

const subComponents: StaticQuestionComponents = {
  Filter: createComponent(
    () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion?.Filter,
  ),
  FilterDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.FilterDropdown,
  ),
  ResetButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion?.ResetButton,
  ),
  Title: createComponent(
    () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion?.Title,
  ),
  Summarize: createComponent(
    () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion?.Summarize,
  ),
  SummarizeDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.SummarizeDropdown,
  ),
  QuestionVisualization: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.QuestionVisualization,
  ),
  ChartTypeSelector: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.ChartTypeSelector,
  ),
  ChartTypeDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.ChartTypeDropdown,
  ),
  QuestionSettings: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.QuestionSettings,
  ),
  QuestionSettingsDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.QuestionSettingsDropdown,
  ),
  Breakout: createComponent(
    () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion?.Breakout,
  ),
  BreakoutDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.BreakoutDropdown,
  ),
  DownloadWidget: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.DownloadWidget,
  ),
  DownloadWidgetDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.DownloadWidgetDropdown,
  ),
  AlertsButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion?.AlertsButton,
  ),
  SqlParametersList: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticQuestion
        ?.SqlParametersList,
  ),
};

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = Object.assign(_StaticQuestion, subComponents);
