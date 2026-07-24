import type { ComboboxItem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  DatasetColumn,
  Field,
  FieldValue,
  NormalizedField,
  Table,
} from "metabase-types/api";

const STAGE_INDEX = -1;

export function getFieldOption([value, label]: FieldValue): ComboboxItem {
  return {
    value: String(value),
    label: String(label ?? value),
  };
}

export function getFieldOptions(fieldValues: FieldValue[]): ComboboxItem[] {
  return fieldValues.filter(([value]) => value != null).map(getFieldOption);
}

type ColumnQueryField = DatasetColumn | NormalizedField | Field;

type ColumnQuery = { query: Lib.Query; column: Lib.ColumnMetadata };

export const getColumnQueries = (
  metadata: Metadata,
  table: Pick<Table, "id" | "db_id"> | undefined,
  fields: ColumnQueryField[],
): Map<ColumnQueryField, ColumnQuery> => {
  if (table === undefined) {
    return new Map();
  }

  const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);

  if (tableMetadata === null) {
    return new Map();
  }

  const query = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    tableMetadata,
  );

  return new Map(
    fields.map((field): [ColumnQueryField, ColumnQuery] => [
      field,
      { query, column: Lib.fromLegacyColumn(query, STAGE_INDEX, field) },
    ]),
  );
};
