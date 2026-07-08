import type {
  GetParameterValuesRequest,
  ParameterValues,
  SearchParameterValuesRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag } from "./tags";

export const parametersApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getParameterValues: builder.query<
      ParameterValues,
      GetParameterValuesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/dataset/parameter/values`,
        body,
      }),
      providesTags: (_values, _error, params) => [
        idTag("parameter-values", params.parameter.id),
      ],
    }),
    searchParameterValues: builder.query<
      ParameterValues,
      SearchParameterValuesRequest
    >({
      query: ({ query, ...body }) => ({
        method: "POST",
        url: `/api/dataset/parameter/search/${encodeURIComponent(query)}`,
        body,
      }),
      // Each distinct search term is its own cache entry and RTK Query has no
      // entry-count cap, so retaining type-ahead results would let the cache
      // grow unbounded. Drop them as soon as the request is no longer in use.
      keepUnusedDataFor: 0,
    }),
  }),
});

export const { useGetParameterValuesQuery, useSearchParameterValuesQuery } =
  parametersApi;
