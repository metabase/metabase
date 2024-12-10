import type {
  AutocompleteSuggestion,
  AutocompleteSuggestionsRequest,
  CardAutocompleteRequest,
  CardAutocompleteSuggestion,
} from "metabase-types/api/autocomplete";

import { Api } from "./api";

export const autocompleteApi = Api.injectEndpoints({
  endpoints: builder => ({
    getAutocompleteSuggestions: builder.query<
      AutocompleteSuggestion[],
      AutocompleteSuggestionsRequest
    >({
      query: ({ databaseId, matchStyle, query }) => ({
        method: "GET",
        url: `/api/database/${databaseId}/autocomplete_suggestions?${matchStyle}=${query}`,
      }),
    }),
    getCardAutocompleteSuggestions: builder.query<
      CardAutocompleteSuggestion[],
      CardAutocompleteRequest
    >({
      query: ({ databaseId, query }) => ({
        method: "GET",
        url: `/api/database/${databaseId}/card_autocomplete_suggestions?query=${query}`,
      }),
    }),
  }),
});

export const {
  useGetAutocompleteSuggestionsQuery,
  useLazyGetAutocompleteSuggestionsQuery,
  useGetCardAutocompleteSuggestionsQuery,
  useLazyGetCardAutocompleteSuggestionsQuery,
} = autocompleteApi;
