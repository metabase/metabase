import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { parseSearchOptions } from "metabase/lib/browser";
import type { EmbedOptions } from "metabase-types/store";

export const DEFAULT_EMBED_OPTIONS: EmbedOptions = {
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

export const urlParameterToBoolean = (
  urlParameter: string | string[] | boolean | undefined,
) => {
  if (urlParameter === undefined) {
    return undefined;
  }
  if (Array.isArray(urlParameter)) {
    return Boolean(urlParameter.at(-1));
  } else {
    return Boolean(urlParameter);
  }
};

const interactiveEmbedSlice = createSlice({
  name: "interactiveEmbed",
  initialState: {
    options: {} as EmbedOptions,
    isEmbeddingSdk: false,
  },
  reducers: {
    setInitialUrlOptions: (
      state,
      action: PayloadAction<{ search: string; hash: string }>,
    ) => {
      const searchOptions = parseSearchOptions(action.payload.search);
      state.options = {
        side_nav:
          urlParameterToBoolean(searchOptions.side_nav) ??
          DEFAULT_EMBED_OPTIONS["side_nav"],
        header:
          urlParameterToBoolean(searchOptions.header) ??
          DEFAULT_EMBED_OPTIONS["header"],
        top_nav:
          urlParameterToBoolean(searchOptions.top_nav) ??
          DEFAULT_EMBED_OPTIONS["top_nav"],
        search:
          urlParameterToBoolean(searchOptions.search) ??
          DEFAULT_EMBED_OPTIONS["search"],
        new_button:
          urlParameterToBoolean(searchOptions.new_button) ??
          DEFAULT_EMBED_OPTIONS["new_button"],
        breadcrumbs:
          urlParameterToBoolean(searchOptions.breadcrumbs) ??
          DEFAULT_EMBED_OPTIONS["breadcrumbs"],
        logo:
          urlParameterToBoolean(searchOptions.logo) ??
          DEFAULT_EMBED_OPTIONS["logo"],
        additional_info:
          urlParameterToBoolean(searchOptions.additional_info) ??
          DEFAULT_EMBED_OPTIONS["additional_info"],
        action_buttons:
          urlParameterToBoolean(searchOptions.action_buttons) ??
          DEFAULT_EMBED_OPTIONS["action_buttons"],
      };
    },
    setOptions: (state, action: PayloadAction<Partial<EmbedOptions>>) => {
      state.options = {
        ...state.options,
        ...action.payload,
      };
    },
  },
});

export const { setInitialUrlOptions, setOptions } =
  interactiveEmbedSlice.actions;

// eslint-disable-next-line import/no-default-export
export default interactiveEmbedSlice.reducer;
