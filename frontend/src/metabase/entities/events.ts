import { t } from "ttag";
import { Event } from "metabase-types/api/event";
import { createEntity, undo } from "metabase/lib/entities";

type UndoOpts = Record<string, unknown>;

const Events = createEntity({
  name: "events",
  nameOne: "event",
  path: "/api/event",

  objectActions: {
    setArchived: (
      { id }: { id: Pick<Event, "id"> },
      archived: boolean,
      opts: UndoOpts,
    ) =>
      Events.actions.update(
        { id },
        { archived },
        undo(opts, t`event`, archived ? t`archived` : t`unarchived`),
      ),
  },
});

export default Events;
