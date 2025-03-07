import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import { compose, pick } from "underscore";

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
    entity_types: ["model", "table"],
  } as const;

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
        normalizeCommaSeparatedSearchOptions(["entity_types"]),
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

function normalizeCommaSeparatedSearchOptions(
  options: (keyof InteractiveEmbeddingOptions)[],
): (search: string) => string {
  return function (search: string) {
    const searchParams = new URLSearchParams(search);

    for (const option of options) {
      const [optionValues] = searchParams.getAll(option);
      if (optionValues && isArrayString(optionValues)) {
        searchParams.delete(option);
        optionValues.split(",").forEach(value => {
          const normalizedValue = value.trim();
          if (normalizedValue) {
            searchParams.append(option, normalizedValue);
          }
        });
      }
    }
    return searchParams.toString();
  };
}

function isArrayString(string: string) {
  return string.includes(",");
}

function excludeNonInteractiveEmbeddingOptions(
  embeddingOptions: Record<string, any>,
): Partial<InteractiveEmbeddingOptions> {
  return pick(embeddingOptions, ALLOWED_INTERACTIVE_EMBEDDING_OPTIONS);
}

function normalizeEntityTypes(
  searchOptions: Partial<InteractiveEmbeddingOptions>,
): Partial<InteractiveEmbeddingOptions> {
  const ALLOWED_ENTITY_TYPES: NonNullable<
    InteractiveEmbeddingOptions["entity_types"]
  > = ["model", "table"];

  const { entity_types: entityTypesValueOrArray } = searchOptions;
  if (entityTypesValueOrArray) {
    const entityTypes = Array.isArray(entityTypesValueOrArray)
      ? entityTypesValueOrArray
      : [entityTypesValueOrArray];
    const filteredEntityTypes = entityTypes.filter(type =>
      ALLOWED_ENTITY_TYPES.includes(type),
    );

    if (filteredEntityTypes.length === 0) {
      return {
        ...searchOptions,
        // Default value
        entity_types: ["model", "table"],
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

// eslint-disable-next-line import/no-default-export
export default interactiveEmbedSlice.reducer;
