import { t } from "ttag";
import { createEntity, undo } from "metabase/lib/entities";

const TimelineEvents = createEntity({
  name: "timelineEvents",
  nameOne: "timelineEvent",
  path: "/api/timeline_event",

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
