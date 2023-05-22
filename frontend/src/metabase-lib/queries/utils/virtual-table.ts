import { TableId } from "metabase-types/api";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import type Database from "metabase-lib/metadata/Database";
import type Metadata from "metabase-lib/metadata/Metadata";
import type StructuredQuery from "../StructuredQuery";
import type NativeQuery from "../NativeQuery";

type VirtualTableProps = {
  id: TableId;
  name: string;
  display_name: string;
  metadata: Metadata;
  db?: Database;
  fields?: Field[];
};

type VirtualFieldProps = {
  metadata: Metadata;
  query: StructuredQuery | NativeQuery;
} & Partial<Field>;

// For when you have no Table
export function createVirtualTable({
  id,
  name,
  display_name,
  metadata,
  db,
  fields,
}: VirtualTableProps): Table {
  const table = new Table({
    id,
    db_id: Number(db?.id),
    name,
    display_name,
    schema: "",
    description: null,
    active: true,
    visibility_type: null,
    field_order: "database",
    initial_sync_status: "complete",
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
