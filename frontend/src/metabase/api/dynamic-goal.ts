import type {
  GetGoalValuesRequest,
  ReferencedEntitiesResults,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag } from "./tags";

export const dynamicGoalApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getGoalValues: builder.query<
      ReferencedEntitiesResults,
      GetGoalValuesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/dynamic-goal/values",
        body,
        // a goal that fails to load must not log the viewer out
        noEvent: true,
      }),
      providesTags: (_response, _error, { sources }) =>
        sources.map((source) => idTag(source.type, source.id)),
    }),
  }),
});

export const { useGetGoalValuesQuery } = dynamicGoalApi;
