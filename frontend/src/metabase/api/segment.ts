import type {
  BaseEntityId,
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
import { handleLoadedByEntityId } from "./utils/lifecycle";

export const segmentApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listSegments: builder.query<Segment[], void>({
      query: () => ({
        method: "GET",
        url: "/api/segment",
      }),
      providesTags: (segments = []) => provideSegmentListTags(segments),
    }),
    getSegment: builder.query<Segment, SegmentId | BaseEntityId>({
      query: (id) => ({
        method: "GET",
        url: `/api/segment/${id}`,
      }),
      providesTags: (segment) => (segment ? provideSegmentTags(segment) : []),
      onQueryStarted: (id, { dispatch, queryFulfilled }) =>
        handleLoadedByEntityId(id, queryFulfilled, (segment) =>
          dispatch(
            segmentApi.util.upsertQueryData("getSegment", segment.id, segment),
          ),
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
