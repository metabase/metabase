import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";

export const DEFAULT_EMBED_OPTIONS = {
  top_nav: true,
  side_nav: "default",
  search: true,
  new_button: true,
  breadcrumbs: true,
  logo: false,
  header: true,
  additional_info: true,
  action_buttons: true,
  enable_chart_explainer: false,
} as const;

export const SET_OPTIONS = "metabase/embed/SET_OPTIONS";
export const setOptions = createAction(SET_OPTIONS);

export const TOGGLE_CHART_EXPLAINER = "metabase/embed/TOGGLE_CHART_EXPLAINER";
export const toggleChartExplainer = createAction(TOGGLE_CHART_EXPLAINER);

export const TOGGLE_DASHBOARD_SUMMARIZER =
  "metabase/embed/TOGGLE_DASHBOARD_SUMMARIZER";
export const toggleDashboardSummarizer = createAction(
  TOGGLE_DASHBOARD_SUMMARIZER,
);
export const TOGGLE_COPY_TO_WORKSPACE =
  "metabase/embed/TOGGLE_COPY_TO_WORKSPACE";
export const toggleCopyToWorkspace = createAction(TOGGLE_COPY_TO_WORKSPACE);

const options = handleActions(
  {
    [SET_OPTIONS]: (state, { payload }) => ({
      ...DEFAULT_EMBED_OPTIONS,
      ...payload,
    }),
    [TOGGLE_CHART_EXPLAINER]: (state, { payload }) => ({
      ...state,
      ...payload,
    }),
    [TOGGLE_DASHBOARD_SUMMARIZER]: (state, { payload }) => ({
      ...state,
      ...payload,
    }),
    [TOGGLE_COPY_TO_WORKSPACE]: (state, { payload }) => ({
      ...state,
      ...payload,
    }),
  },
  {},
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  options,
});
