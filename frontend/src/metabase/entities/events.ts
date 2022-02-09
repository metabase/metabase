import { t } from "ttag";
import { Collection, Event } from "metabase-types/api";
import { createEntity, undo } from "metabase/lib/entities";
import { getDefaultTimeline } from "metabase/lib/events";
import EventTimelines from "metabase/entities/event-timelines";

type UndoOpts = Record<string, unknown>;

const Events = createEntity({
  name: "events",
  nameOne: "event",
  path: "/api/event",

  actions: {
    createWithTimeline: (
      event: Partial<Event>,
      collection: Collection,
    ) => async (dispatch: any) => {
      const defaults = getDefaultTimeline(collection);
      const timeline = await EventTimelines.api.create(defaults);
      dispatch({ type: EventTimelines.actionTypes.INVALIDATE_LISTS_ACTION });
      dispatch(Events.actions.create({ ...event, timeline_id: timeline.id }));
    },
  },

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
