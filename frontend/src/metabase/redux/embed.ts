import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { parseHashOptions, parseSearchOptions } from "metabase/lib/browser";
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
      state.options = {
        ...DEFAULT_EMBED_OPTIONS,
        ...parseSearchOptions(action.payload.search),
        ...parseHashOptions(action.payload.hash),
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
