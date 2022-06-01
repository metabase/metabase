import { ISO8601Time } from "metabase-types/api/time";
import { Table } from "metabase-types/api/table";

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

export type DatabaseDetails = {
  [key: string]: any;
};

export type DatabaseEngine = string;

export type DatabaseNativePermission = "write" | "read";

export type DatabaseInitialSyncStatus = "incomplete" | "complete" | "aborted";

export interface Database {
  id: DatabaseId;
  name: string;
  engine: DatabaseType;
  is_sample: boolean;
  creator_id?: number;
  created_at: ISO8601Time;
  updated_at: ISO8601Time;
  timezone?: string;
  initial_sync_status: DatabaseInitialSyncStatus;

  tables: Table[];

  description?: string;
  details: DatabaseDetails;
  features: DatabaseFeature[];
  is_full_sync: boolean;
  native_permissions: DatabaseNativePermission;

  caveats?: string;
  points_of_interest?: string;
}
