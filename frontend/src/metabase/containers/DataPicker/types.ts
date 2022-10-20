import type Database from "metabase-lib/lib/metadata/Database";
import type Table from "metabase-lib/lib/metadata/Table";
import type Schema from "metabase-lib/lib/metadata/Schema";

export type DataPickerValue = {
  databaseId?: Database["id"];
  schemaId?: Schema["id"];
  tableIds: Table["id"][];
};

export interface DataPickerProps {
  value: DataPickerValue;
  onChange: (value: DataPickerValue) => void;
}
