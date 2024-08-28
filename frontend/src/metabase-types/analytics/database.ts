import type { DatabaseId } from "metabase-types/api";

export type DatabaseConnectionSuccessfulEvent = {
  event: "database_connection_successful";
  database: string;
  database_id: DatabaseId;
  source: "setup" | "admin";
  dbms_version: string;
};

export type DatabaseConnectionFailedEvent = {
  event: "database_connection_failed";
  database: string;
  database_id: DatabaseId;
  error_type: string;
  source: "setup" | "admin";
  dbms_version: string;
};

export type DatabaseEvent =
  | DatabaseConnectionSuccessfulEvent
  | DatabaseConnectionFailedEvent;
