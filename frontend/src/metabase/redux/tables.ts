import { fieldApi, tableApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { updateMetadata } from "metabase/redux/metadata";
import type { Dispatch, GetState } from "metabase/redux/store";
import { TableSchema } from "metabase/schema";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import type { FieldId, TableId } from "metabase-types/api";

type FetchOptions = {
  reload?: boolean;
  params?: Record<string, unknown>;
};

// Minimal structural view of a table's foreign-key-bearing fields. Avoids
// pulling the heavy `Table` class type into this module's inference, which keeps
// the project under TypeScript's instantiation-depth limit.
type ForeignKeyField = {
  target?: { table_id?: TableId } | null;
  fk_target_field_id?: FieldId | null;
};
type ForeignKeyHost =
  | { fields?: ForeignKeyField[]; fks?: unknown[] }
  | null
  | undefined;

/**
 * Loads `query_metadata` for a single table, so `getMetadata` can read it.
 * Replaces the `Tables.actions.fetchMetadata` entity action.
 *
 * Normalization into `state.entities` happens in the endpoint's own
 * `onQueryStarted` (it dispatches `updateMetadata(data, TableSchema)`), so this
 * thunk just initiates the request and returns the unwrapped result.
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
 * `state.entities`. Replaces the `Tables.actions.fetchForeignKeys` entity
 * action.
 */
export const fetchTableForeignKeys =
  ({ id }: { id: TableId }) =>
  async (dispatch: Dispatch, getState: GetState) => {
    // Already loaded — skip, so callers that fire this from an effect don't
    // churn the store on every re-render (mirrors the cached entity action).
    const table = getMetadataUnfiltered(getState()).table(id) as ForeignKeyHost;
    if (table?.fks != null) {
      return { id, fks: table.fks };
    }
    const fks = await runRtkEndpoint(
      id,
      dispatch,
      tableApi.endpoints.listTableForeignKeys,
      { forceRefetch: false },
    );
    dispatch(updateMetadata({ id, fks }, TableSchema));
    return { id, fks };
  };

/**
 * Loads a table's metadata along with the metadata of any tables/fields it
 * links to via foreign key. Replaces the
 * `Tables.actions.fetchMetadataAndForeignTables` entity action.
 */
export const fetchTableMetadataAndForeignKeys =
  ({ id }: { id: TableId }, options: FetchOptions = {}) =>
  async (dispatch: Dispatch, getState: GetState) => {
    await dispatch(fetchTableMetadata({ id }, options));

    const table = getMetadataUnfiltered(getState()).table(id) as ForeignKeyHost;
    await Promise.all([
      ...getTableForeignKeyTableIds(table).map((tableId) =>
        dispatch(fetchTableMetadata({ id: tableId }, options)),
      ),
      // overridden model FK columns have fk_target_field_id but don't have a
      // target — in this case we load the field instead of the table
      ...getTableForeignKeyFieldIds(table).map((fieldId) =>
        runRtkEndpoint({ id: fieldId }, dispatch, fieldApi.endpoints.getField, {
          forceRefetch: options.reload ?? false,
        }),
      ),
    ]);
  };

function getTableForeignKeyTableIds(table: ForeignKeyHost): TableId[] {
  const tableIds: TableId[] = [];
  for (const field of table?.fields ?? []) {
    const tableId = field.target?.table_id;
    if (tableId != null) {
      tableIds.push(tableId);
    }
  }
  return Array.from(new Set(tableIds));
}

function getTableForeignKeyFieldIds(table: ForeignKeyHost): FieldId[] {
  const fieldIds: FieldId[] = [];
  for (const field of table?.fields ?? []) {
    if (field.target == null && field.fk_target_field_id != null) {
      fieldIds.push(field.fk_target_field_id);
    }
  }
  return Array.from(new Set(fieldIds));
}
