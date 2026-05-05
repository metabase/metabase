import { timelineEventApi, useGetTimelineEventQuery } from "metabase/api";
import { TimelineEventSchema } from "metabase/schema";

import { createEntity, entityCompatibleQuery } from "./utils";

/**
 * @deprecated use "metabase/api" instead
 */
export const TimelineEvents = createEntity({
  name: "timelineEvents",
  nameOne: "timelineEvent",
  path: "/api/timeline-event",
  schema: TimelineEventSchema,

  rtk: () => ({
    getUseGetQuery: () => ({
      useGetQuery,
    }),
  }),

  api: {
    list: () => {
      throw new TypeError("TimelineEvents.api.list is not supported");
    },
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        timelineEventApi.endpoints.getTimelineEvent,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        timelineEventApi.endpoints.createTimelineEvent,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        timelineEventApi.endpoints.updateTimelineEvent,
      ),
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(
        id,
        dispatch,
        timelineEventApi.endpoints.deleteTimelineEvent,
      ),
  },
});

const useGetQuery = ({ id }, options) => {
  return useGetTimelineEventQuery(id, options);
};
