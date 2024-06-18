import { parseHashOptions, parseSearchOptions } from "metabase/lib/browser";
import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";
import type { EmbedOptions } from "metabase-types/store";

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

export const SET_INITIAL_URL_OPTIONS = "metabase/embed/SET_INITIAL_URL_OPTIONS";
export const setInitialUrlOptions = createAction(
  SET_INITIAL_URL_OPTIONS,
  ({ search, hash }: { search: string; hash: string }) => {
    return {
      ...parseSearchOptions(search),
      ...parseHashOptions(hash),
    };
  },
);

export const SET_OPTIONS = "metabase/embed/SET_OPTIONS";
export const setOptions = createAction(
  SET_OPTIONS,
  (options: Partial<EmbedOptions>) => options,
);

const options = handleActions(
  {
    [SET_INITIAL_URL_OPTIONS]: (state, { payload }) => ({
      ...DEFAULT_EMBED_OPTIONS,
      ...payload,
    }),

    [SET_OPTIONS]: (state, { payload }) => ({
      ...state,
      ...payload,
    }),
  },
  {},
);

const isEmbeddingSdk = handleActions({}, false);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  options,
  isEmbeddingSdk,
});
