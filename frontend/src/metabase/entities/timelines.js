import {
  skipToken,
  timelineApi,
  timelineEventApi,
  useGetTimelineQuery,
  useListCollectionTimelinesQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { getDefaultTimeline } from "metabase/common/utils/timelines";
import { TimelineSchema } from "metabase/schema";

import { createEntity, entityCompatibleQuery } from "./utils";

/**
 * @deprecated use "metabase/api" instead
 */
export const Timelines = createEntity({
  name: "timelines",
  nameOne: "timeline",
  path: "/api/timeline",
  schema: TimelineSchema,

  rtk: () => ({
    getUseGetQuery: () => ({
      useGetQuery: useGetTimelineQuery,
    }),
    useListQuery,
  }),

  api: {
    list: ({ collectionId, ...params } = {}, dispatch) =>
      collectionId
        ? entityCompatibleQuery(
            { id: collectionId, ...params },
            dispatch,
            timelineApi.endpoints.listCollectionTimelines,
          )
        : entityCompatibleQuery(
            params,
            dispatch,
            timelineApi.endpoints.listTimelines,
          ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        timelineApi.endpoints.getTimeline,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        timelineApi.endpoints.createTimeline,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        timelineApi.endpoints.updateTimeline,
      ),
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(id, dispatch, timelineApi.endpoints.deleteTimeline),
  },

  actions: {
    createWithEvent: (event, collection) => async (dispatch) => {
      const timeline = await entityCompatibleQuery(
        getDefaultTimeline(collection),
        dispatch,
        timelineApi.endpoints.createTimeline,
      );
      await entityCompatibleQuery(
        { ...event, timeline_id: timeline.id },
        dispatch,
        timelineEventApi.endpoints.createTimelineEvent,
      );

      dispatch({ type: Timelines.actionTypes.INVALIDATE_LISTS_ACTION });
    },
  },
});

function useListQuery({ collectionId, ...params } = {}, options) {
  const collectionTimelines = useListCollectionTimelinesQuery(
    collectionId ? { id: collectionId, ...params } : skipToken,
    options,
  );

  const timelines = useListTimelinesQuery(
    collectionId ? skipToken : params,
    options,
  );

  return collectionId ? collectionTimelines : timelines;
}
