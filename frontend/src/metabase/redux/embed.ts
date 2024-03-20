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
  },
  {},
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  options,
});
