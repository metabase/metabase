import type { DatabaseId, Field, FieldId, TableId } from "metabase-types/api";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  tableId: TableId;
}

export function FilteringPreview(props: Props) {
  return <>filtering</>;
}
