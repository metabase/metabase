import { t } from "ttag";
import { Event } from "metabase-types/api";
import { createEntity, undo } from "metabase/lib/entities";

type UndoOpts = Record<string, unknown>;

const Events = createEntity({
  name: "events",
  nameOne: "event",
  path: "/api/event",

  objectActions: {
    setArchived: ({ id }: Event, archived: boolean, opts: UndoOpts) =>
      Events.actions.update(
        { id },
        { archived },
        undo(opts, t`event`, archived ? t`archived` : t`unarchived`),
      ),
  },
});

export default Events;
