import type {
  ListRevisionRequest,
  RevertRevisionRequest,
  Revision,
} from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, listTag, provideRevisionListTags } from "./tags";

export const revisionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listRevisions: builder.query<Revision[], ListRevisionRequest>({
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

export const { useListRevisionsQuery, useRevertRevisionMutation } = revisionApi;
