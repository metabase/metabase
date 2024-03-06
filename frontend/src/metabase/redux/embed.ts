import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";

export const DEFAULT_EMBED_OPTIONS = {
  top_nav: true,
  side_nav: "default",
  search: false,
  new_button: false,
  breadcrumbs: true,
  logo: true,
  header: true,
  additional_info: true,
  action_buttons: true,
} as const;

export const SET_OPTIONS = "metabase/embed/SET_OPTIONS";
export const setOptions = createAction(SET_OPTIONS);

const options = handleActions(
  {
    [SET_OPTIONS]: (state, { payload }) => {
      return {
        ...DEFAULT_EMBED_OPTIONS,
        ...payload,
      };
    },
  },
  {},
);

const isEmbeddingSdk = handleActions({}, false);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  options,
  isEmbeddingSdk,
});
