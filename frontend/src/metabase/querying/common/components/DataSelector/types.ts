import type {
  Database,
  Field,
  IconName,
  NormalizedSchema,
  SchemaName,
  Table,
} from "metabase-types/api";
export type DataPickerDataType =
  | "models"
  | "raw-data"
  | "questions"
  | "metrics";

export type DataTypeInfoItem = {
  id: DataPickerDataType;
  icon: IconName;
  name: string;
  description: string;
};

// The data selector reads an entity's own columns and resolves the relations
// between entities through the store's `EntityGraph`. Leaving the relation
// keys out is what lets plain API objects, the store's normalized records and
// the v1 metadata objects all fit.
export type DataSelectorDatabase = Omit<Database, "tables" | "schemas">;

export type DataSelectorSchema = Pick<
  NormalizedSchema,
  "id" | "name" | "database"
>;

export type DataSelectorTable = Omit<
  Table,
  "db" | "fields" | "fks" | "segments" | "measures" | "metrics" | "schema"
> & {
  schema_name?: SchemaName;
};

export type DataSelectorField = Omit<
  Field,
  "table" | "target" | "name_field" | "dimensions"
>;
