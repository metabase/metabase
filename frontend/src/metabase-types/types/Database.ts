/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

import { Table } from "./Table";
import { ISO8601Time } from ".";

export type DatabaseId = number;

export type DatabaseType = string; // "h2" | "postgres" | etc

export type DatabaseFeature =
  | "basic-aggregations"
  | "standard-deviation-aggregations"
  | "expression-aggregations"
  | "foreign-keys"
  | "native-parameters"
  | "nested-queries"
  | "expressions"
  | "case-sensitivity-string-filter-options"
  | "binning";

export type DatabaseDetails = Record<string, any>;

export type DatabaseSettings = {
  [key: string]: any;
};

export type DatabaseEngine = string;

export type DatabaseNativePermission = "write" | "read";

export type Database = {
  id: DatabaseId;
  name: string;
  description?: string;

  tables: Table[];

  details: DatabaseDetails;
  settings?: DatabaseSettings | null;
  engine: DatabaseType;
  features: DatabaseFeature[];
  is_full_sync: boolean;
  is_sample: boolean;
  native_permissions: DatabaseNativePermission;

  caveats?: string;
  points_of_interest?: string;

  created_at: ISO8601Time;
  updated_at: ISO8601Time;
};
