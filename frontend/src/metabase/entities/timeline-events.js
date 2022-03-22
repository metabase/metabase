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
    setArchived: ({ id }, archived, opts) =>
      TimelineEvents.actions.update(
        { id },
        { archived },
        undo(opts, t`event`, archived ? t`archived` : t`unarchived`),
      ),
  },
});

export default TimelineEvents;
