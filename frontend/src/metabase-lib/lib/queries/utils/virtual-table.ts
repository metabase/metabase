import Table from "metabase-lib/lib/metadata/Table";
import Field from "metabase-lib/lib/metadata/Field";
import Database from "metabase-lib/lib/metadata/Database";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import StructuredQuery from "../StructuredQuery";
import NativeQuery from "../NativeQuery";

type VirtualTableProps = {
  metadata: Metadata;
  fields?: Field[];
  db?: Database | null;
} & Partial<Table>;

type VirtualFieldProps = {
  metadata: Metadata;
  query: StructuredQuery | NativeQuery;
} & Partial<Field>;

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
