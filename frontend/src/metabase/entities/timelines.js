import { t } from "ttag";
import { updateIn } from "icepick";
import _ from "underscore";
import { TimelineSchema } from "metabase/schema";
import { TimelineApi } from "metabase/services";
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
    list: async (params, ...args) => {
      if (params.cardId) {
        return TimelineApi.getCardTimelines(params, ...args);
      } else if (params.collectionId) {
        return TimelineApi.getCollectionTimelines(params, ...args);
      } else {
        return TimelineApi.getTimelines(params, ...args);
      }
    },
  },

  actions: {
    createWithEvent: (event, collection) => async dispatch => {
      const timelineData = getDefaultTimeline(collection);
      const timelineAction = Timelines.actions.create(timelineData);
      const timelineResponse = await dispatch(timelineAction);
      const timeline = Timelines.HACK_getObjectFromAction(timelineResponse);

      const eventData = { ...event, timeline_id: timeline.id };
      const eventAction = TimelineEvents.actions.create(eventData);
      await dispatch(eventAction);

      return {
        type: "metabase/entities/timelines/CREATE_WITH_EVENT",
        payload: timeline,
      };
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
