import { getSetting } from "metabase/selectors/settings";
import { MetabaseApi } from "metabase/services";
import type { State } from "metabase-types/store";

import type { AutocompleteItem, CardCompletionItem } from "./types";

export const getCardAutocompleteResultsFn = (state: State) => {
  return function autocompleteResults(
    prefix: string,
  ): Promise<CardCompletionItem[]> {
    const dbId = state.qb.card?.dataset_query?.database;
    if (!dbId || prefix.length === 0) {
      return Promise.resolve([]);
    }

    return MetabaseApi.db_card_autocomplete_suggestions({
      dbId,
      query: prefix,
    });
  };
};

export const getAutocompleteResultsFn = (state: State) => {
  const matchStyle = getSetting(state, "native-query-autocomplete-match-style");

  if (matchStyle === "off") {
    return null;
  }

  return function autocompleteResults(
    prefix: string,
  ): Promise<AutocompleteItem[]> {
    const dbId = state.qb.card?.dataset_query?.database;
    if (!dbId || prefix.length === 0) {
      return Promise.resolve([]);
    }

    return MetabaseApi.db_autocomplete_suggestions({
      dbId,
      query: prefix,
      matchStyle,
    });
  };
};
