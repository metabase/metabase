import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import { compose, pick } from "underscore";

import { DEFAULT_EMBEDDING_ENTITY_TYPES } from "metabase/embedding-sdk/store";
import { parseSearchOptions } from "metabase/lib/browser";
import type { InteractiveEmbeddingOptions } from "metabase-types/store";

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
    entity_types: DEFAULT_EMBEDDING_ENTITY_TYPES,
  };

const ALLOWED_INTERACTIVE_EMBEDDING_OPTIONS = Object.keys(
  DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS,
);

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
    options: {} as InteractiveEmbeddingOptions,
    isEmbeddingSdk: false,
  },
  reducers: {
    setInitialUrlOptions: (
      state,
      action: PayloadAction<{ search: string }>,
    ) => {
      const searchOptions = compose(
        normalizeEntityTypes,
        excludeNonInteractiveEmbeddingOptions,
        parseSearchOptions,
        normalizeEntityTypesCommaSeparatedSearchParameter,
      )(action.payload.search);

      state.options = {
        ...DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS,
        ...searchOptions,
      };
    },
    setOptions: (
      state,
      action: PayloadAction<Partial<InteractiveEmbeddingOptions>>,
    ) => {
      state.options = {
        ...state.options,
        ...action.payload,
      };
    },
  },
});

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
  const ALLOWED_ENTITY_TYPES: InteractiveEmbeddingOptions["entity_types"] = [
    "model",
    "table",
  ];

  /**
   * `parseSearchOptions` would return either a string or an array of strings.
   */
  const { entity_types: entityTypesValueOrArray } = searchOptions;
  if (entityTypesValueOrArray) {
    const entityTypes = Array.isArray(entityTypesValueOrArray)
      ? entityTypesValueOrArray
      : [entityTypesValueOrArray];
    const filteredEntityTypes = entityTypes.filter((type) =>
      ALLOWED_ENTITY_TYPES.includes(type),
    );

    if (filteredEntityTypes.length === 0) {
      return {
        ...searchOptions,
        entity_types: DEFAULT_EMBEDDING_ENTITY_TYPES,
      };
    }

    return {
      ...searchOptions,
      entity_types: filteredEntityTypes,
    };
  }

  return searchOptions;
}

export const { setInitialUrlOptions, setOptions } =
  interactiveEmbedSlice.actions;

export const embed = interactiveEmbedSlice.reducer;
