import type {
  ListRevisionRequest,
  RevertRevisionRequest,
  Revision,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideRevisionListTags,
} from "./tags";

export const revisionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listRevisions: builder.query<Revision[], ListRevisionRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/revision",
        params,
      }),
      providesTags: (revisions = []) => provideRevisionListTags(revisions),
    }),
    revertRevision: builder.mutation<Revision, RevertRevisionRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/revision/revert",
        body,
      }),
      invalidatesTags: (_, error, { entity, id }) => {
        const tags = [listTag("revision")];
        // Also invalidate the entity that was reverted so it refetches
        if (entity === "card") {
          tags.push(idTag("card", id));
        } else if (entity === "dashboard") {
          tags.push(idTag("dashboard", id));
        } else if (entity === "document") {
          tags.push(idTag("document", id));
        } else if (entity === "segment") {
          tags.push(idTag("segment", id));
        } else if (entity === "transform") {
          tags.push(idTag("transform", id));
        }
        return invalidateTags(error, tags);
      },
    }),
  }),
});

export const { useListRevisionsQuery, useRevertRevisionMutation } = revisionApi;
