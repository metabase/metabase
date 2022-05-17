import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";

const DEFAULT_OPTIONS = {
  top_nav: false,
  side_nav: "default",
  search: false,
  new_button: false,
  header: true,
  additional_info: true,
  action_buttons: true,
};

export const SET_OPTIONS = "metabase/embed/SET_OPTIONS";
export const setOptions = createAction(SET_OPTIONS);

const options = handleActions(
  {
    [SET_OPTIONS]: (state, { payload }) => ({ ...DEFAULT_OPTIONS, ...payload }),
  },
  {},
);

export default combineReducers({
  options,
});
