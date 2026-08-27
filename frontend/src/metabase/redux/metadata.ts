import { type Schema, normalize } from "normalizr";
import _ from "underscore";

import { databaseApi, fieldApi, segmentApi, tableApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { Dispatch, State } from "metabase/redux/store";
import { DatabaseSchema, FieldSchema, TableSchema } from "metabase/schema";
import type {
  Database,
  Field,
  FieldId,
  FieldValue,
  Segment,
  Table,
} from "metabase-types/api";

const UPDATE = "metabase/entities/UPDATE";

// Normalizes an entity (or list) and dispatches it into `state.entities`.
// Handled by the per-slice reducers in `metabase/redux/entities` — see
// `makeSliceReducer` there, which merges `payload.entities.<name>` into the
// matching `state.entities.<name>` slice so `getMetadata` picks up the change.
export function updateMetadata(data: unknown, schema: Schema) {
  const payload = normalize(data, schema);
  return { type: UPDATE, payload };
}

/**
 * A field's client-accumulated remappings. No endpoint returns these: they are
 * merged in by `addRemappings` as values are fetched, and one component's fetch
 * labels values for another, so a component cannot answer this from its own
 * result.
 */
export function getFieldRemappings(
  state: State,
  fieldId: FieldId,
): FieldValue[] {
  return state.entities.fields[fieldId]?.remappings ?? [];
}

export const updateSegment =
  (segment: Segment) =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(segment, dispatch, segmentApi.endpoints.updateSegment);

export const updateDatabase =
  (database: Database) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const slimDatabase = _.omit(database, "tables", "tables_lookup");
    const result: unknown = await runRtkEndpoint(
      slimDatabase,
      dispatch,
      databaseApi.endpoints.updateDatabase,
    );
    dispatch(updateMetadata(result, DatabaseSchema));
    return result;
  };

export const updateTable =
  (table: Table) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const slimTable = _.omit(
      table,
      "fields",
      "fields_lookup",
      "aggregation_operators",
      "segments",
    );
    const result: unknown = await runRtkEndpoint(
      slimTable,
      dispatch,
      tableApi.endpoints.updateTable,
    );
    dispatch(updateMetadata(result, TableSchema));
    return result;
  };

export const updateField =
  (field: Field) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const slimField = _.omit(field, "filter_operators_lookup");
    const result: unknown = await runRtkEndpoint(
      slimField,
      dispatch,
      fieldApi.endpoints.updateField,
    );
    dispatch(updateMetadata(result, FieldSchema));
    return result;
  };
