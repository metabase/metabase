import { fieldApi, tableApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import {
  type MetadataSelectorOpts,
  getShallowFields,
  getShallowTables,
  tableForeignKeysFetched,
} from "metabase/metadata-store";
import type { Dispatch, GetState, State } from "metabase/redux/store";
import { isNotNull } from "metabase/utils/types";
import type { FieldId, TableId } from "metabase-types/api";

// Matches `getMetadataUnfiltered`, which this module read before: a table is
// worth loading whether or not it is hidden.
const UNFILTERED: MetadataSelectorOpts = {
  includeHiddenTables: true,
  includeSensitiveFields: true,
};

type FetchOptions = {
  reload?: boolean;
  params?: Record<string, unknown>;
};

/**
 * Loads `query_metadata` for a single table, so `getMetadata` can read it.
 *
 * `metadataHydrationMiddleware` mirrors the response into `state.entities`, so
 * this thunk only starts the request and returns the unwrapped result.
 */
export const fetchTableMetadata =
  (
    { id, ...params }: { id: TableId; [key: string]: unknown },
    options: FetchOptions = {},
  ) =>
  async (dispatch: Dispatch) =>
    runRtkEndpoint(
      { id, ...params, ...options.params },
      dispatch,
      tableApi.endpoints.getTableQueryMetadata,
      { forceRefetch: options.reload ?? false },
    );

/**
 * Loads a table's foreign keys and normalizes them onto the table in
 * `state.entities`.
 */
export const fetchTableForeignKeys =
  ({ id }: { id: TableId }) =>
  async (dispatch: Dispatch, getState: GetState) => {
    // Already loaded, so callers that fire this from an effect do not churn
    // the store on every re-render.
    const table = getShallowTables(getState(), UNFILTERED)[id];
    if (table?.fks != null) {
      return { id, fks: table.fks };
    }
    const fks = await runRtkEndpoint(
      id,
      dispatch,
      tableApi.endpoints.listTableForeignKeys,
      { forceRefetch: false },
    );
    dispatch(tableForeignKeysFetched(id, fks));
    return { id, fks };
  };

/**
 * Loads a table's metadata along with the metadata of any tables or fields it
 * links to via foreign key.
 */
export const fetchTableMetadataAndForeignKeys =
  ({ id }: { id: TableId }, options: FetchOptions = {}) =>
  async (dispatch: Dispatch, getState: GetState) => {
    await dispatch(fetchTableMetadata({ id }, options));

    const state = getState();
    const fields = getTableFields(state, id);
    const storeFields = getShallowFields(state, UNFILTERED);

    await Promise.allSettled([
      ...getForeignKeyTableIds(fields, storeFields).map((tableId) =>
        dispatch(fetchTableMetadata({ id: tableId }, options)),
      ),
      // overridden model FK columns have fk_target_field_id but the target
      // field is not in the store — load the field instead of the table
      ...getMissingTargetFieldIds(fields, storeFields).map((fieldId) =>
        runRtkEndpoint({ id: fieldId }, dispatch, fieldApi.endpoints.getField, {
          forceRefetch: options.reload ?? false,
        }),
      ),
    ]);
  };

// Structural views rather than the API types, which keeps this module's
// inference under TypeScript's instantiation-depth limit.
type FkSourceField = { fk_target_field_id?: FieldId | null };
type FieldsById = Record<string, { table_id?: TableId } | undefined>;

/**
 * A table's fields come either inline as `original_fields` or as ids into the
 * field map, the same two sources the v1 `Table` wrapper reads.
 */
function getTableFields(state: State, id: TableId): FkSourceField[] {
  const table = getShallowTables(state, UNFILTERED)[id];
  if (table?.original_fields) {
    return table.original_fields;
  }
  const storeFields = getShallowFields(state, UNFILTERED);
  return (table?.fields ?? [])
    .map((fieldId) => storeFields[fieldId])
    .filter(isNotNull);
}

function getForeignKeyTableIds(
  fields: FkSourceField[],
  storeFields: FieldsById,
): TableId[] {
  const tableIds = fields
    .map((field) => targetField(field, storeFields)?.table_id)
    .filter(isNotNull);
  return Array.from(new Set(tableIds));
}

function getMissingTargetFieldIds(
  fields: FkSourceField[],
  storeFields: FieldsById,
): FieldId[] {
  const fieldIds = fields
    .filter((field) => targetField(field, storeFields) == null)
    .map((field) => field.fk_target_field_id)
    .filter(isNotNull);
  return Array.from(new Set(fieldIds));
}

function targetField(field: FkSourceField, storeFields: FieldsById) {
  return field.fk_target_field_id != null
    ? storeFields[field.fk_target_field_id]
    : undefined;
}
