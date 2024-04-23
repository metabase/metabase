import type {
  Revision,
  ListRevisionRequest,
  RevertRevisionRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { listTag, invalidateTags, provideRevisionListTags } from "./tags";

export const revisionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listRevision: builder.query<Revision[], ListRevisionRequest>({
      query: params => ({
        method: "GET",
        url: "/api/revision",
        params,
      }),
      providesTags: (revisions = []) => provideRevisionListTags(revisions),
    }),
    revertRevision: builder.mutation<Revision, RevertRevisionRequest>({
      query: body => ({
        method: "POST",
        url: "/api/revision/revert",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("revision")]),
    }),
  }),
});

export const { useListRevisionQuery, useRevertRevisionMutation } = revisionApi;
