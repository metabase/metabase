import { t } from "ttag";
import { TimelineEventSchema } from "metabase/schema";
import { createEntity, undo } from "metabase/lib/entities";
import forms from "./timeline-events/forms";

const TimelineEvents = createEntity({
  name: "timelineEvents",
  nameOne: "timelineEvent",
  path: "/api/timeline-event",
  schema: TimelineEventSchema,
  forms,

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
