import type {
  CreateTimelineEventRequest,
  TimelineEvent,
  TimelineEventId,
  UpdateTimelineEventRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  tag,
  provideTimelineEventTags,
} from "./tags";

export const timelineEventApi = Api.injectEndpoints({
  endpoints: builder => ({
    getTimelineEvent: builder.query<TimelineEvent, TimelineEventId>({
      query: id => ({
        method: "GET",
        url: `/api/timeline-event/${id}`,
      }),
      providesTags: event => (event ? provideTimelineEventTags(event) : []),
    }),
    createTimelineEvent: builder.mutation<
      TimelineEvent,
      CreateTimelineEventRequest
    >({
      query: body => ({
        method: "POST",
        url: "/api/timeline-event",
        body,
      }),
      invalidatesTags: (event, error) =>
        invalidateTags(error, [
          listTag("timeline-event"),
          ...(event ? [idTag("timeline", event.timeline_id)] : []),
        ]),
    }),
    updateTimelineEvent: builder.mutation<
      TimelineEvent,
      UpdateTimelineEventRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/timeline-event/${id}`,
        body,
      }),
      invalidatesTags: (event, error, { id }) =>
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
  useGetTimelineEventQuery,
  useCreateTimelineEventMutation,
  useUpdateTimelineEventMutation,
  useDeleteTimelineEventMutation,
} = timelineEventApi;
