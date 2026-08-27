import _ from "underscore";

import { databaseApi, fieldApi, segmentApi, tableApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { updateMetadata } from "metabase/redux/metadata";
import type { Dispatch } from "metabase/redux/store";
import { DatabaseSchema, FieldSchema, TableSchema } from "metabase/schema";
import type { Database, Field, Segment, Table } from "metabase-types/api";

/**
 * The edit forms in this module submit the entity they rendered, which came
 * from `state.entities` and carries the nested records the mirror stitched onto
 * it. The API rejects those, so each one is dropped before the request.
 *
 * These write the response into the mirror themselves rather than the update
 * endpoints hydrating for everyone. Those endpoints have around 25 other
 * callers, and hydrating for all of them broke
 * `database-writable-connection.cy.spec.ts`.
 */

export const updateDatabase =
  (database: Database) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const result: unknown = await runRtkEndpoint(
      _.omit(database, "tables", "tables_lookup"),
      dispatch,
      databaseApi.endpoints.updateDatabase,
    );
    dispatch(updateMetadata(result, DatabaseSchema));
    return result;
  };

export const updateTable =
  (table: Table) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const result: unknown = await runRtkEndpoint(
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
    dispatch(updateMetadata(result, TableSchema));
    return result;
  };

export const updateField =
  (field: Field) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const result: unknown = await runRtkEndpoint(
      _.omit(field, "filter_operators_lookup"),
      dispatch,
      fieldApi.endpoints.updateField,
    );
    dispatch(updateMetadata(result, FieldSchema));
    return result;
  };

export const updateSegment =
  (segment: Segment) =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(segment, dispatch, segmentApi.endpoints.updateSegment);
