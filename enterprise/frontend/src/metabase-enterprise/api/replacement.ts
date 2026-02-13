import type {
  ReplaceSourceInfo,
  ReplaceSourceRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, tag } from "./tags";

export const replacementApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    checkReplaceSource: builder.query<ReplaceSourceInfo, ReplaceSourceRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/replacement/check-replace-source",
        body,
      }),
      providesTags: (_response, _error, request) => [
        idTag(request.source_entity_type, request.source_entity_id),
        idTag(request.target_entity_type, request.target_entity_id),
      ],
    }),
    replaceSource: builder.mutation<void, ReplaceSourceRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/replacement/replace-source",
        body,
      }),
      invalidatesTags: (_response, error) =>
        !error ? [tag("table"), tag("card")] : [],
    }),
  }),
});

export const { useCheckReplaceSourceQuery, useReplaceSourceMutation } =
  replacementApi;
