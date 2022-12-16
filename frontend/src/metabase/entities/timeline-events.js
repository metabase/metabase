import { t } from "ttag";
import { TimelineEventSchema } from "metabase/schema";
import { TimelineEventApi } from "metabase/services";
import { createEntity, undo } from "metabase/lib/entities";
import { addTimelineEvent } from "metabase/query_builder/actions/timelines";

const TimelineEvents = createEntity({
  name: "timelineEvents",
  nameOne: "timelineEvent",
  path: "/api/timeline-event",
  schema: TimelineEventSchema,

  api: {
    create: async params => {
      const event = await TimelineEventApi.create(params);
      addTimelineEvent({ id: event.id });
      // dispatch({ type: ADD_TIMELINE_EVENT, payload: { id: event.id } });
      return event;
    },
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
