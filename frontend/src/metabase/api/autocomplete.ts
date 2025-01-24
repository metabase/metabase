import { provideAutocompleteSuggestionTags } from "metabase/api/tags";
import type {
  AutocompleteRequest,
  AutocompleteSuggestion,
  CardAutocompleteRequest,
  CardAutocompleteSuggestion,
} from "metabase-types/api/autocomplete";

import { Api } from "./api";

export const autocompleteApi = Api.injectEndpoints({
  endpoints: builder => ({
    getAutocompleteSuggestions: builder.query<
      AutocompleteSuggestion[],
      AutocompleteRequest
    >({
      query: ({ databaseId }) => ({
        method: "GET",
        url: `/api/database/${databaseId}/autocomplete_suggestions`,
      }),
      providesTags: () => provideAutocompleteSuggestionTags(),
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
