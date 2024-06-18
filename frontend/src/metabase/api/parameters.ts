import type {
  GetParameterValuesRequest,
  ParameterValues,
  SearchParameterValuesRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag } from "./tags";

export const parametersApi = Api.injectEndpoints({
  endpoints: builder => ({
    getParameterValues: builder.query<
      ParameterValues,
      GetParameterValuesRequest
    >({
      query: params => ({
        method: "POST",
        url: `/api/dataset/parameter/values`,
        params,
      }),
      providesTags: (_values, _error, params) => [
        idTag("parameter-values", params.parameter.id),
      ],
    }),
    searchParameterValues: builder.query<
      ParameterValues,
      SearchParameterValuesRequest
    >({
      query: params => ({
        method: "POST",
        url: `/api/dataset/parameter/search/${params.query}`,
        params,
      }),
    }),
  }),
});
