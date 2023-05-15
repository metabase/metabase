import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import type Database from "metabase-lib/metadata/Database";
import type Metadata from "metabase-lib/metadata/Metadata";
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
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
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
