import { t } from "ttag";
import { updateIn } from "icepick";
import _ from "underscore";
import { TimelineSchema } from "metabase/schema";
import { TimelineApi, TimelineEventApi } from "metabase/services";
import { createEntity, undo } from "metabase/lib/entities";
import { getDefaultTimeline, getTimelineName } from "metabase/lib/timelines";
import { canonicalCollectionId } from "metabase/collections/utils";
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
    setCollection: (timeline, collection, opts) => {
      return Timelines.actions.update(
        { id: timeline.id },
        {
          name: getTimelineName(timeline),
          collection_id: canonicalCollectionId(collection && collection.id),
          default: false,
        },
        undo(opts, t`timeline`, t`moved`),
      );
    },

    setArchived: (timeline, archived, opts) => {
      return Timelines.actions.update(
        { id: timeline.id },
        { archived, default: false },
        undo(opts, t`timeline`, archived ? t`archived` : t`unarchived`),
      );
    },
  },

  reducer: (state = {}, action) => {
    if (action.type === TimelineEvents.actionTypes.CREATE && !action.error) {
      const event = TimelineEvents.HACK_getObjectFromAction(action);

      return updateIn(state, [event.timeline_id, "events"], (eventIds = []) => {
        return [...eventIds, event.id];
      });
    }

    if (action.type === TimelineEvents.actionTypes.UPDATE && !action.error) {
      const event = TimelineEvents.HACK_getObjectFromAction(action);

      return _.mapObject(state, timeline => {
        const hasEvent = timeline.events?.includes(event.id);
        const hasTimeline = event.timeline_id === timeline.id;

        return updateIn(timeline, ["events"], (eventIds = []) => {
          if (hasEvent && !hasTimeline) {
            return _.without(eventIds, event.id);
          } else if (!hasEvent && hasTimeline) {
            return [...eventIds, event.id];
          } else {
            return eventIds;
          }
        });
      });
    }

    if (action.type === TimelineEvents.actionTypes.DELETE && !action.error) {
      const eventId = action.payload.result;

      return _.mapObject(state, timeline => {
        return updateIn(timeline, ["events"], (eventIds = []) => {
          return _.without(eventIds, eventId);
        });
      });
    }

    return state;
  },
});

export default Timelines;
