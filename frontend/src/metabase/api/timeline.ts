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
import { idTag, invalidateTags, listTag, tag } from "./tags";

function timelineTags(timeline: Timeline) {
  return [
    idTag("timeline", timeline.id),
    ...(timeline.collection
      ? [idTag("collection", timeline.collection.id)]
      : []),
    ...(timeline.events ? [listTag("timeline-event")] : []),
  ];
}

export const timelineApi = Api.injectEndpoints({
  endpoints: builder => ({
    listTimelines: builder.query<Timeline[], ListTimelinesRequest>({
      query: body => ({
        method: "GET",
        url: "/api/timeline",
        body,
      }),
      providesTags: (timelines = []) => [
        listTag("timeline"),
        ...timelines.flatMap(timelineTags),
      ],
    }),
    listCollectionTimelines: builder.query<
      Timeline[],
      ListCollectionTimelinesRequest
    >({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/collection/${id}/timelines`,
        body,
      }),
      providesTags: (timelines = []) => [
        listTag("timeline"),
        ...timelines.flatMap(timelineTags),
      ],
    }),
    getTimeline: builder.query<Timeline, GetTimelineRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/timeline/${id}`,
        body,
      }),
      providesTags: timeline => (timeline ? timelineTags(timeline) : []),
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
