import { t } from "ttag";

import { timelineEventApi } from "metabase/api";
import {
  createEntity,
  entityCompatibleQuery,
  undo,
} from "metabase/lib/entities";
import { TimelineEventSchema } from "metabase/schema";

/**
 * @deprecated use "metabase/api" instead
 */
const TimelineEvents = createEntity({
  name: "timelineEvents",
  nameOne: "timelineEvent",
  path: "/api/timeline-event",
  schema: TimelineEventSchema,

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

  objectActions: {
    setTimeline: ({ id }, timeline, opts) => {
      return TimelineEvents.actions.update(
        { id },
        { timeline_id: timeline.id },
        undo(opts, t`event`, t`moved`),
      );
    },

    setArchived: ({ id }, archived, opts) => {
      return TimelineEvents.actions.update(
        { id },
        { archived },
        undo(opts, t`event`, archived ? t`archived` : t`unarchived`),
      );
    },
  },
});

export default TimelineEvents;
