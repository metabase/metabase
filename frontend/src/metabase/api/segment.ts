import { updateMetadata } from "metabase/lib/redux/metadata";
import { SegmentSchema } from "metabase/schema";
import type {
  CreateSegmentRequest,
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
import { handleQueryFulfilled } from "./utils/lifecycle";

export const segmentApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listSegments: builder.query<Segment[], void>({
      query: () => ({
        method: "GET",
        url: "/api/segment",
      }),
      providesTags: (segments = []) => provideSegmentListTags(segments),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, [SegmentSchema])),
        ),
    }),
    getSegment: builder.query<Segment, SegmentId>({
      query: (id) => ({
        method: "GET",
        url: `/api/segment/${id}`,
      }),
      providesTags: (segment) => (segment ? provideSegmentTags(segment) : []),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, SegmentSchema)),
        ),
    }),
    createSegment: builder.mutation<Segment, CreateSegmentRequest>({
      query: (body) => ({
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
  }),
});

export const {
  useListSegmentsQuery,
  useGetSegmentQuery,
  useCreateSegmentMutation,
  useUpdateSegmentMutation,
} = segmentApi;
