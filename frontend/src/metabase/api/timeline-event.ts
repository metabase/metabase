import type {
  CreateTimelineEventRequest,
  TimelineEvent,
  TimelineEventId,
  UpdateTimelineEventRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

export const timelineEventApi = Api.injectEndpoints({
  endpoints: builder => ({
    listTimelineEvents: builder.query<TimelineEvent[], void>({
      query: () => ({
        method: "GET",
        url: "/api/timeline-event",
      }),
      providesTags: (timelineEvents = []) => [
        listTag("timeline-event"),
        ...(timelineEvents.map(({ id }) => idTag("timeline-event", id)) ?? []),
      ],
    }),
    getTimelineEvent: builder.query<TimelineEvent, TimelineEventId>({
      query: id => ({
        method: "GET",
        url: `/api/timeline-event/${id}`,
      }),
      providesTags: timelineEvent =>
        timelineEvent ? [idTag("timeline-event", timelineEvent.id)] : [],
    }),
    createTimelineEvent: builder.mutation<
      TimelineEvent,
      CreateTimelineEventRequest
    >({
      query: body => ({
        method: "POST",
        url: "/api/timelineEvent",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("timeline-event"), tag("timeline")]),
    }),
    updateTimelineEvent: builder.mutation<
      TimelineEvent,
      UpdateTimelineEventRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/timelineEvent/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("timeline-event"),
          idTag("timeline-event", id),
          tag("timeline"),
        ]),
    }),
    deleteTimelineEvent: builder.mutation<TimelineEvent, TimelineEventId>({
      query: id => ({
        method: "DELETE",
        url: `/api/timeline-event/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("timeline-event"),
          idTag("timeline-event", id),
          tag("timeline"),
        ]),
    }),
  }),
});

export const {
  useListTimelineEventsQuery,
  useGetTimelineEventQuery,
  useCreateTimelineEventMutation,
  useUpdateTimelineEventMutation,
  useDeleteTimelineEventMutation,
} = timelineEventApi;
