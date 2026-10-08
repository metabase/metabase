// The module's public interface.
// Names absent here are module-private on purpose — add them only when a real consumer needs them.
// The directory is in rspack's SIDE_EFFECT_FREE_PATHS, so importing one name here links only to that file
// and the pages stay in the chunk the routes' import() creates.

export { queryBuilderReducer } from "./store/reducer";
export type { QueryBuilderStoreState } from "./store/state";
export { navigateBackToDashboard } from "./store/actions";
export {
  getCard,
  getIsSavedQuestionChanged,
  getOriginalQuestion,
  getQuestion,
} from "./store/question-selectors";

export { loadCard } from "./actions/core/card";
export { type QueryParams, resolveCards } from "./actions/core/initializeQB";
export { getParameterValuesForQuestion } from "./actions/core/parameterUtils";
export { computeQuestionPivotTable } from "./actions/core/pivot-table";
export { zoomInRow } from "./actions/zoom";

export {
  type AggregationItem,
  getAggregationItems,
} from "./utils/get-aggregation-items";
export { getAdHocQuestionWithVizSettings } from "./utils/viz-settings";

export type { UpdateQueryHookProps } from "./hooks/types";
export { useBreakoutQueryHandlers } from "./hooks/use-breakout-query-handlers";

export {
  type OnCreateOptions,
  useCreateQuestion,
} from "./containers/use-create-question";
export { useSaveQuestion } from "./containers/use-save-question";

export { ChartTypeSettings } from "./components/chart-type-selector/ChartTypeSettings/ChartTypeSettings";
export { useQuestionVisualizationState } from "./components/chart-type-selector/use-question-visualization-state";
export { PublicOrEmbeddedQuestionDownloadPopover } from "./components/QuestionDownloadPopover/QuestionDownloadPopover";
export { QuestionHashRedirect } from "./components/QuestionHashRedirect";
export { getBreakoutListItem } from "./components/view/sidebars/SummarizeSidebar/BreakoutColumnList/util";
export type { ListItem as BreakoutListItem } from "./components/view/sidebars/SummarizeSidebar/BreakoutColumnList/types";
export {
  getAdHocQuestionDescription,
  shouldRenderAdhocDescription,
} from "./components/view/ViewHeader/components/AdHocQuestionDescription/AdHocQuestionDescription";
export {
  describeQueryStage,
  getInfoStageIndex,
} from "./components/view/ViewHeader/components/AdHocQuestionDescription/utils";
export { HeadBreadcrumbs } from "./components/view/ViewHeader/components/HeaderBreadcrumbs/HeaderBreadcrumbs";
export { QueryBuilderBackButton } from "./components/view/ViewHeader/components/QueryBuilderBackButton/QueryBuilderBackButton";
export type { DataSourcePart } from "./components/view/ViewHeader/components/QuestionDataSource/utils";
export { QuestionFiltersHeader } from "./components/view/ViewHeader/components/QuestionFiltersHeader/QuestionFiltersHeader";
export { ViewHeading } from "./components/view/ViewSection";

// The store imports this module on every page, so the pages themselves stay behind an import().
export const loadQueryBuilder = () => import("./containers/QueryBuilder");
export const loadMetabotQueryBuilder = () =>
  import("./components/MetabotQueryBuilder/MetabotQueryBuilder");
