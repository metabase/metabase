import { t } from "ttag";
import { EventTimeline } from "metabase-types/types/Event";
import { createEntity, undo } from "metabase/lib/entities";

type UndoOpts = Record<string, unknown>;

export const EventTimelines = createEntity({
  name: "timelines",
  nameOne: "timeline",
  path: "/api/timeline",

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
