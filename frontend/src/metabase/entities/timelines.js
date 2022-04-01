import { t } from "ttag";
import { updateIn } from "icepick";
import _ from "underscore";
import { TimelineSchema } from "metabase/schema";
import { TimelineApi, TimelineEventApi } from "metabase/services";
import { createEntity, undo } from "metabase/lib/entities";
import { getDefaultTimeline } from "metabase/lib/timelines";
import TimelineEvents from "./timeline-events";
import forms from "./timelines/forms";

const Timelines = createEntity({
  name: "timelines",
  nameOne: "timeline",
  path: "/api/timeline",
  schema: TimelineSchema,
  forms,

  api: {
    list: (params, ...args) => {
      return params.collectionId
        ? TimelineApi.listForCollection(params, ...args)
        : TimelineApi.list(params, ...args);
    },
  },

  actions: {
    createWithEvent: (event, collection) => async dispatch => {
      const timeline = await TimelineApi.create(getDefaultTimeline(collection));
      await TimelineEventApi.create({ ...event, timeline_id: timeline.id });

      dispatch({ type: Timelines.actionTypes.INVALIDATE_LISTS_ACTION });
      dispatch({ type: TimelineEvents.actionTypes.INVALIDATE_LISTS_ACTION });
    },
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Timelines.actions.update(
        { id },
        { archived },
        undo(opts, t`timeline`, archived ? t`archived` : t`unarchived`),
      ),
  },

  reducer: (state = {}, action) => {
    if (action.type === TimelineEvents.actionTypes.CREATE) {
      const event = TimelineEvents.HACK_getObjectFromAction(action);
      return updateIn(state, [event.timeline_id, "events"], (events = []) => {
        return [...events, event.id];
      });
    }

    if (action.type === TimelineEvents.actionTypes.DELETE) {
      const eventId = action.payload.result;
      return _.mapObject(state, timeline =>
        updateIn(timeline, ["events"], events => _.without(events, eventId)),
      );
    }

    return state;
  },
});

export default Timelines;
