import type Database from "metabase-lib/lib/metadata/Database";
import type Table from "metabase-lib/lib/metadata/Table";
import type Schema from "metabase-lib/lib/metadata/Schema";

export type DataPickerDataType = "models" | "raw-data" | "questions";

export type DataPickerValue = {
  type?: DataPickerDataType;
  databaseId?: Database["id"];
  schemaId?: Schema["id"];
  tableIds: Table["id"][];
};

export interface VirtualTable {
  id: Table["id"];
  display_name: string;
  schema: {
    id: Schema["id"];
  };
}

export interface DataPickerProps {
  value: DataPickerValue;
  onChange: (value: DataPickerValue) => void;
}

export type DataPickerSelectedItem = {
  type: "database" | "schema" | "table";
  id: string | number;
};
