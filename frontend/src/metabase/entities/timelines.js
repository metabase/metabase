import { t } from "ttag";
import { TimelineApi } from "metabase/services";
import { createEntity, undo } from "metabase/lib/entities";
import { getDefaultTimeline } from "metabase/lib/timeline";
import TimelineEvents from "./timeline-events";
import forms from "./timelines/forms";

const Timelines = createEntity({
  name: "timelines",
  nameOne: "timeline",
  path: "/api/timeline",
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
});

export default Timelines;
