import { t } from "ttag";
import { EventTimeline } from "metabase-types/api";
import { createEntity, undo } from "metabase/lib/entities";
import forms from "./event-timelines/forms";

type UndoOpts = Record<string, unknown>;

const EventTimelines = createEntity({
  name: "eventTimelines",
  nameOne: "eventTimeline",
  path: "/api/event-timeline",
  forms,

  objectActions: {
    setArchived: (
      { id }: { id: Pick<EventTimeline, "id"> },
      archived: boolean,
      opts: UndoOpts,
    ) =>
      EventTimelines.actions.update(
        { id },
        { archived },
        undo(opts, t`timeline`, archived ? t`archived` : t`unarchived`),
      ),
  },
});

export default EventTimelines;
