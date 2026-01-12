import {
  segmentApi,
  useGetSegmentQuery,
  useListSegmentsQuery,
} from "metabase/api";
import { color } from "metabase/lib/colors";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import { SegmentSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";

/**
 * @deprecated use "metabase/api" instead
 */
export const Segments = createEntity({
  name: "segments",
  nameOne: "segment",
  path: "/api/segment",
  schema: SegmentSchema,

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery,
    }),
    useListQuery: useListSegmentsQuery,
  },

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        segmentApi.endpoints.listSegments,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        segmentApi.endpoints.getSegment,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        segmentApi.endpoints.createSegment,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        segmentApi.endpoints.updateSegment,
      ),
  },

  objectActions: {
    setArchived: (
      { id },
      archived,
      { revision_message = archived ? "(Archive)" : "(Unarchive)" } = {},
    ) => Segments.actions.update({ id }, { archived, revision_message }),

    // NOTE: DELETE not currently implemented
    delete: null,
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).segment(entityId),
  },

  objectSelectors: {
    getName: (segment) => segment && segment.name,
    getColor: (segment) => color("filter"),
  },
});

const useGetQuery = ({ id }, options) => {
  return useGetSegmentQuery(id, options);
};
