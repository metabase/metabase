import type {
  CollectionId,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

import type Database from "metabase-lib/metadata/Database";
import type Table from "metabase-lib/metadata/Table";
import type Schema from "metabase-lib/metadata/Schema";

export type DataPickerDataType = "models" | "raw-data" | "questions";

export type DataPickerValue = {
  type?: DataPickerDataType;
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
  collectionId?: CollectionId;
  tableIds: TableId[];
};

export interface DataPickerFilters {
  types: (type: DataPickerDataType) => boolean;
  databases: (database: Database) => boolean;
  schemas: (schema: Schema) => boolean;
  tables: (table: Table) => boolean;
}

export type DataPickerFiltersProp = Partial<DataPickerFilters>;

export interface DataPickerProps {
  value: DataPickerValue;
  onChange: (value: DataPickerValue) => void;
  filters?: DataPickerFiltersProp;
  isMultiSelect?: boolean;
}

export type DataPickerSelectedItem = {
  type: "database" | "schema" | "collection" | "table";
  id: string | number;
};
