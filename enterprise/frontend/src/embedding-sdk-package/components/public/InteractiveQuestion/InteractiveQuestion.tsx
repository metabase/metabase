import type { InteractiveQuestionComponents } from "embedding-sdk-bundle/components/public/InteractiveQuestion/InteractiveQuestion";
import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

const _InteractiveQuestion = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion,
);

const subComponents: InteractiveQuestionComponents = {
  BackButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.BackButton,
  ),
  NavigationBackButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.NavigationBackButton,
  ),
  Filter: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion?.Filter,
  ),
  FilterDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.FilterDropdown,
  ),
  ResetButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.ResetButton,
  ),
  Title: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion?.Title,
  ),
  Summarize: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.Summarize,
  ),
  SummarizeDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.SummarizeDropdown,
  ),
  Notebook: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion?.Editor,
  ),
  Editor: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion?.Editor,
  ),
  NotebookButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.EditorButton,
  ),
  EditorButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.EditorButton,
  ),
  QuestionVisualization: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.QuestionVisualization,
  ),
  SaveQuestionForm: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.SaveQuestionForm,
  ),
  SaveButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.SaveButton,
  ),
  ChartTypeSelector: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.ChartTypeSelector,
  ),
  QuestionSettings: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.QuestionSettings,
  ),
  QuestionSettingsDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.QuestionSettingsDropdown,
  ),
  BreakoutDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.BreakoutDropdown,
  ),
  Breakout: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion?.Breakout,
  ),
  ChartTypeDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.ChartTypeDropdown,
  ),
  DownloadWidget: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.DownloadWidget,
  ),
  DownloadWidgetDropdown: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.DownloadWidgetDropdown,
  ),
  AlertsButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.AlertsButton,
  ),
  VisualizationButton: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.VisualizationButton,
  ),
  SqlParametersList: createComponent(
    () =>
      getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.InteractiveQuestion
        ?.SqlParametersList,
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
