import type { ISO8601Time } from ".";
import type { Table } from "./Table";

export type DatabaseId = number;

export type DatabaseType = string; // "h2" | "postgres" | etc

export type DatabaseFeature =
  | "basic-aggregations"
  | "standard-deviation-aggregations"
  | "expression-aggregations"
  | "foreign-keys"
  | "native-parameters"
  | "expressions";

export type DatabaseDetails = {
  [key: string]: any,
};

export type DatabaseEngine = string;

export type DatabaseNativePermission = "write" | "read";

export type Database = {
  id: DatabaseId,
  name: string,
  description: ?string,

  tables: Table[],

  details: DatabaseDetails,
  engine: DatabaseType,
  features: DatabaseFeature[],
  is_full_sync: boolean,
  is_sample: boolean,
  native_permissions: DatabaseNativePermission,

  caveats: ?string,
  points_of_interest: ?string,

  created_at: ISO8601Time,
  updated_at: ISO8601Time,
};
