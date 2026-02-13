import {
  type PayloadAction,
  asyncThunkCreator,
  buildCreateSlice,
} from "@reduxjs/toolkit";
import { compose, pick } from "underscore";

import { parseSearchOptions } from "metabase/lib/browser";
import {
  DEFAULT_EMBEDDING_ENTITY_TYPES,
  setEntityTypes,
} from "metabase/redux/embedding-data-picker";
import type { InteractiveEmbeddingOptions } from "metabase-types/store";
import type { EmbeddingDataPicker } from "metabase-types/store/embedding-data-picker";

export const createSlice = buildCreateSlice({
  creators: { asyncThunk: asyncThunkCreator },
});

export const DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS: InteractiveEmbeddingOptions =
  {
    font: undefined,
    top_nav: true,
    side_nav: "default",
    search: false,
    new_button: false,
    breadcrumbs: true,
    logo: true,
    header: true,
    additional_info: true,
    action_buttons: true,
    data_picker: "flat",
  };

const ALLOWED_INTERACTIVE_EMBEDDING_OPTIONS = Object.keys(
  DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS,
)
  // `entity_types` used to be in the embed slice, but it's moved to the embedding data picker slice already.
  .concat("entity_types");

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

interface Location {
  search: string;
}
const interactiveEmbedSlice = createSlice({
  name: "interactiveEmbed",
  initialState: {
    options: {} as InteractiveEmbeddingOptions,
    isEmbeddingSdk: false,
  },
  reducers: (create) => ({
    setInitialUrlOptions: create.asyncThunk(
      ({ search }: Location, { dispatch }) => {
        const { entity_types, ...searchOptions } = processSearch(search);

        dispatch(setEntityTypes(entity_types));
        // XXX: Set the data picker type here.

        return searchOptions;
      },
      {
        pending: (state) => state,
        fulfilled: (state, action) => {
          state.options = {
            ...DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS,
            ...action.payload,
          };
        },
      },
    ),
    setOptions: create.reducer(
      (state, action: PayloadAction<Partial<InteractiveEmbeddingOptions>>) => {
        state.options = {
          ...state.options,
          ...action.payload,
        };
      },
    ),
  }),
});

const normalizeProperties = compose(normalizeEntityTypes, normalizeDataPicker);

const processSearch = compose(
  normalizeProperties,
  excludeNonInteractiveEmbeddingOptions,
  parseSearchOptions,
  normalizeEntityTypesCommaSeparatedSearchParameter,
);

/**
 * this functions turns a string like `entity_types=value1,value2` into `entity_types=value1&entity_types=value2` that matches the URLSearchParams format
 */
function normalizeEntityTypesCommaSeparatedSearchParameter(
  search: string,
): string {
  const searchParams = new URLSearchParams(search);

  const PARAMETER = "entity_types";
  const [optionValues] = searchParams.getAll(PARAMETER);
  if (optionValues && isArrayString(optionValues)) {
    searchParams.delete(PARAMETER);
    optionValues.split(",").forEach((value) => {
      const normalizedValue = value.trim();
      if (normalizedValue) {
        searchParams.append(PARAMETER, normalizedValue);
      }
    });
  }
  return searchParams.toString();
}

function isArrayString(string: string) {
  return string.includes(",");
}

function excludeNonInteractiveEmbeddingOptions(
  embeddingOptions: Record<string, any>,
): Partial<InteractiveEmbeddingOptions> {
  return pick(embeddingOptions, ALLOWED_INTERACTIVE_EMBEDDING_OPTIONS);
}

/**
 * this function is key to ensure that we won't end up with invalid `entity_types` values.
 * As it could not be empty, it needs at least a single valid value. e.g. `["model"]`, or `["model", "table"]`,
 * but never `[]`.
 */
function normalizeEntityTypes(
  searchOptions: Partial<InteractiveEmbeddingOptions>,
): Partial<InteractiveEmbeddingOptions> {
  /**
   * `parseSearchOptions` would return either a string or an array of strings.
   */
  const { entity_types: entityTypesValueOrArray } = searchOptions;
  if (entityTypesValueOrArray) {
    const entityTypes = Array.isArray(entityTypesValueOrArray)
      ? entityTypesValueOrArray
      : [entityTypesValueOrArray];

    return {
      ...searchOptions,
      entity_types: entityTypes,
    };
  }

  return { ...searchOptions, entity_types: DEFAULT_EMBEDDING_ENTITY_TYPES };
}

/**
 *
 * This function normalize the `data_picker` option in the search options to ignore invalid values.
 * @see {@link EmbeddingDataPicker}
 */
function normalizeDataPicker(
  searchOptions: Partial<InteractiveEmbeddingOptions>,
): Partial<InteractiveEmbeddingOptions> {
  const ALLOWED_VALUES: EmbeddingDataPicker[] = ["staged", "flat"];

  const { data_picker: dataPicker, ...restSearchOptions } = searchOptions;

  if (dataPicker && ALLOWED_VALUES.includes(dataPicker)) {
    return {
      ...restSearchOptions,
      data_picker: dataPicker,
    };
  }

  return restSearchOptions;
}

export const { setInitialUrlOptions, setOptions } =
  interactiveEmbedSlice.actions;

export const embed = interactiveEmbedSlice.reducer;
