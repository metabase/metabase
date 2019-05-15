import {
  handleActions,
  combineReducers,
  createAction,
  createThunkAction,
} from "metabase/lib/redux";

import { loadTableAndForeignKeys } from "metabase/lib/table";
import { MetabaseApi, RevisionsApi } from "metabase/services";

import Metrics from "metabase/entities/metrics";
import Segments from "metabase/entities/segments";

// fetchDatabaseIdfields
export const FETCH_IDFIELDS = "metabase/admin/datamodel/FETCH_IDFIELDS";
export const fetchDatabaseIdfields = createThunkAction(FETCH_IDFIELDS, function(
  databaseId,
) {
  return async function(dispatch, getState) {
    try {
      let idfields = await MetabaseApi.db_idfields({ dbId: databaseId });
      return idfields.map(function(field) {
        field.displayName =
          field.table.display_name + " → " + field.display_name;
        return field;
      });
    } catch (error) {
      console.warn("error getting idfields", databaseId, error);
    }
  };
});

export const LOAD_TABLE_METADATA =
  "metabase/admin/datamodel/LOAD_TABLE_METADATA";
export const UPDATE_PREVIEW_SUMMARY =
  "metabase/admin/datamodel/UPDATE_PREVIEW_SUMMARY";

export const loadTableMetadata = createAction(
  LOAD_TABLE_METADATA,
  loadTableAndForeignKeys,
);
export const updatePreviewSummary = createAction(
  UPDATE_PREVIEW_SUMMARY,
  async query => {
    let result = await MetabaseApi.dataset(query);
    return result.data.rows[0][0];
  },
);

// REVISION HISTORY

export const FETCH_REVISIONS = "metabase/admin/datamodel/FETCH_REVISIONS";

export const fetchRevisions = createThunkAction(
  FETCH_REVISIONS,
  ({ entity: entityName, id }) => async (dispatch, getState) => {
    const entity = { segment: Segments, metric: Metrics }[entityName];
    const action = entity.actions.fetch({ id });
    const [object, revisions] = await Promise.all([
      dispatch(action),
      RevisionsApi.get({ entity, id }),
    ]);
    await dispatch(loadTableMetadata(object.payload.object.table_id));
    return { object: object.payload, revisions };
  },
);

// reducers

const previewSummary = handleActions(
  {
    [UPDATE_PREVIEW_SUMMARY]: { next: (state, { payload }) => payload },
  },
  null,
);

const revisionObject = handleActions(
  {
    [FETCH_REVISIONS]: {
      next: (state, { payload: revisionObject }) => revisionObject,
    },
  },
  null,
);

export default combineReducers({ previewSummary, revisionObject });
