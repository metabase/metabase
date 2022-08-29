import Table from "metabase-lib/lib/metadata/Table";
import Field from "metabase-lib/lib/metadata/Field";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import StructuredQuery from "../StructuredQuery";
import NativeQuery from "../NativeQuery";

type VirtualTableProps = {
  metadata: Metadata;
} & Partial<Table>;

type VirtualFieldProps = {
  metadata: Metadata;
  query: StructuredQuery | NativeQuery;
} & Partial<Field>;

export function createVirtualTable({
  metadata,
  ...rest
}: VirtualTableProps): Table {
  const table = new Table({
    name: "",
    display_name: "",
    segments: [],
    metrics: [],
    fields: [],
    ...rest,
  });

  table.metadata = metadata;
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
