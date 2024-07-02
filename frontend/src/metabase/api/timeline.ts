import type {
  CreateTimelineRequest,
  GetTimelineRequest,
  ListCollectionTimelinesRequest,
  ListTimelinesRequest,
  Timeline,
  TimelineId,
  UpdateTimelineRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  tag,
  provideTimelineListTags,
  provideTimelineTags,
} from "./tags";

export const timelineApi = Api.injectEndpoints({
  endpoints: builder => ({
    listTimelines: builder.query<Timeline[], ListTimelinesRequest>({
      query: params => ({
        method: "GET",
        url: "/api/timeline",
        params,
      }),
      providesTags: (timelines = []) => provideTimelineListTags(timelines),
    }),
    listCollectionTimelines: builder.query<
      Timeline[],
      ListCollectionTimelinesRequest
    >({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/collection/${id}/timelines`,
        params,
      }),
      providesTags: (timelines = []) => provideTimelineListTags(timelines),
    }),
    getTimeline: builder.query<Timeline, GetTimelineRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/timeline/${id}`,
        params,
      }),
      providesTags: timeline => (timeline ? provideTimelineTags(timeline) : []),
    }),
    createTimeline: builder.mutation<Timeline, CreateTimelineRequest>({
      query: body => ({
        method: "POST",
        url: "/api/timeline",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("timeline"), tag("timeline")]),
    }),
    updateTimeline: builder.mutation<Timeline, UpdateTimelineRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/timeline/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("timeline"),
          idTag("timeline", id),
          tag("timeline-event"),
        ]),
    }),
    deleteTimeline: builder.mutation<Timeline, TimelineId>({
      query: id => ({
        method: "DELETE",
        url: `/api/timeline/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("timeline"),
          idTag("timeline", id),
          tag("timeline-event"),
        ]),
    }),
  }),
});

export const {
  useListTimelinesQuery,
  useGetTimelineQuery,
  useCreateTimelineMutation,
  useUpdateTimelineMutation,
  useDeleteTimelineMutation,
} = timelineApi;
