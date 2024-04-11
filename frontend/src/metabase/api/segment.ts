import type {
  CreateSegmentRequest,
  DeleteSegmentRequest,
  Segment,
  SegmentId,
  UpdateSegmentRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideSegmentListTags,
  provideSegmentTags,
  tag,
} from "./tags";

export const segmentApi = Api.injectEndpoints({
  endpoints: builder => ({
    listSegments: builder.query<Segment[], void>({
      query: () => ({
        method: "GET",
        url: "/api/segment",
      }),
      providesTags: (segments = []) => provideSegmentListTags(segments),
    }),
    getSegment: builder.query<Segment, SegmentId>({
      query: id => ({
        method: "GET",
        url: `/api/segment/${id}`,
      }),
      providesTags: segment => (segment ? provideSegmentTags(segment) : []),
    }),
    createSegment: builder.mutation<Segment, CreateSegmentRequest>({
      query: body => ({
        method: "POST",
        url: "/api/segment",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("segment"), tag("table")]),
    }),
    updateSegment: builder.mutation<Segment, UpdateSegmentRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/segment/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("segment"),
          idTag("segment", id),
          tag("table"),
        ]),
    }),
    deleteSegment: builder.mutation<Segment, DeleteSegmentRequest>({
      query: ({ id, ...body }) => ({
        method: "DELETE",
        url: `/api/segment/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("segment"),
          idTag("segment", id),
          tag("table"),
        ]),
    }),
  }),
});

export const {
  useListSegmentsQuery,
  useGetSegmentQuery,
  useCreateSegmentMutation,
  useUpdateSegmentMutation,
  useDeleteSegmentMutation,
} = segmentApi;
