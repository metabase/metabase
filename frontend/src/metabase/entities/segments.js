import { segmentApi } from "metabase/api";
import { color } from "metabase/lib/colors";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { SegmentSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";

/**
 * @deprecated use "metabase/api" instead
 */
const Segments = createEntity({
  name: "segments",
  nameOne: "segment",
  path: "/api/segment",
  schema: SegmentSchema,

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
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(id, dispatch, segmentApi.endpoints.deleteSegment),
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
    getName: segment => segment && segment.name,
    getUrl: segment =>
      Urls.tableRowsQuery(
        segment.database_id,
        segment.table_id,
        null,
        segment.id,
      ),
    getColor: segment => color("filter"),
    getIcon: segment => ({ name: "segment" }),
  },
});

export default Segments;
