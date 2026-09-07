import _ from "underscore";

import { databaseApi, fieldApi, segmentApi, tableApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import {
  databaseFetched,
  fieldFetched,
  tableFetched,
} from "metabase/metadata-store";
import type { Dispatch } from "metabase/redux/store";
import type { Database, Field, Segment, Table } from "metabase-types/api";

/**
 * The edit forms in this module submit the entity they rendered, which came
 * from `state.entities` and carries the nested records the mirror stitched onto
 * it. The API rejects those, so each one is dropped before the request.
 */

export const updateDatabase =
  (database: Database) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const updated: Database = await runRtkEndpoint(
      _.omit(database, "tables", "tables_lookup"),
      dispatch,
      databaseApi.endpoints.updateDatabase,
    );
    dispatch(databaseFetched(updated));
    return updated;
  };

export const updateTable =
  (table: Table) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const updated: Table = await runRtkEndpoint(
      _.omit(
        table,
        "fields",
        "fields_lookup",
        "aggregation_operators",
        "segments",
      ),
      dispatch,
      tableApi.endpoints.updateTable,
    );
    dispatch(tableFetched(updated));
    return updated;
  };

export const updateField =
  (field: Field) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const updated: Field = await runRtkEndpoint(
      _.omit(field, "filter_operators_lookup"),
      dispatch,
      fieldApi.endpoints.updateField,
    );
    dispatch(fieldFetched(updated));
    return updated;
  };

export const updateSegment =
  (segment: Segment) =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(segment, dispatch, segmentApi.endpoints.updateSegment);
