import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";
import { parseHashOptions, parseSearchOptions } from "metabase/lib/browser";

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
export const setOptions = createAction(
  SET_OPTIONS,
  ({ search, hash }: { search: string; hash: string }) => {
    return {
      ...parseSearchOptions(search),
      ...parseHashOptions(hash),
    };
  },
);

const options = handleActions(
  {
    [SET_OPTIONS]: (state, { payload }) => ({
      ...DEFAULT_EMBED_OPTIONS,
      ...payload,
    }),
  },
  {},
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  options,
});
