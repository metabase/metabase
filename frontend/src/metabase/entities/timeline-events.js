import { t } from "ttag";

import { createEntity, undo } from "metabase/lib/entities";
import { TimelineEventSchema } from "metabase/schema";

/**
 * @deprecated use "metabase/api" instead
 */
const TimelineEvents = createEntity({
  name: "timelineEvents",
  nameOne: "timelineEvent",
  path: "/api/timeline-event",
  schema: TimelineEventSchema,

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
