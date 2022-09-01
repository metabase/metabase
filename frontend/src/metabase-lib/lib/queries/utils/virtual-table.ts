import Table from "metabase-lib/lib/metadata/Table";
import Field from "metabase-lib/lib/metadata/Field";
import type Database from "metabase-lib/lib/metadata/Database";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type StructuredQuery from "../StructuredQuery";
import type NativeQuery from "../NativeQuery";

type VirtualTableProps = {
  metadata: Metadata;
  fields?: Field[];
  db?: Database | null;
} & Partial<Table>;

type VirtualFieldProps = {
  metadata: Metadata;
  query: StructuredQuery | NativeQuery;
} & Partial<Field>;

// For when you have no Table
export function createVirtualTable({
  metadata,
  fields,
  db,
  ...rest
}: VirtualTableProps): Table {
  const table = new Table({
    name: "",
    display_name: "",
    ...rest,
  });

  Object.assign(table, {
    fields: fields || [],
    db,
    metadata,
    segments: [],
    metrics: [],
  });

  table.metadata = metadata;
  table.db = db;
  table.fields = fields || [];

  table.fields.forEach(field => {
    field.table = table;
    field.table_id = table.id;
  });

  return table;
}

// For when you have a Table but need to override its fields
export function createTableCloneWithOverridedMetadata(
  table: Table,
  fields: Field[],
): Table {
  const clonedTable = table.clone();

  clonedTable.fields = fields;
  clonedTable.getPlainObject().fields = fields.map(field => field.id);

  clonedTable.fields.forEach(field => {
    field.table = clonedTable;
    field.table_id = clonedTable.id;
  });

  return clonedTable;
}

export function createVirtualField({
  metadata,
  query,
  ...rest
}: VirtualFieldProps): Field {
  const field = new Field({
    source: "fields",
    ...rest,
  });

  field.metadata = metadata;
  field.query = query;

  return field;
}
