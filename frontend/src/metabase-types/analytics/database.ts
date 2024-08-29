type DatabaseEventSchema = {
  event: string;
  database?: string | null;
  database_id?: number | null;
  error_type?: string | null;
  source?: string | null;
  dbms_version?: string | null;
};

type ValidateEvent<
  T extends DatabaseEventSchema &
    Record<Exclude<keyof T, keyof DatabaseEventSchema>, never>,
> = T;

export type DatabaseConnectionSuccessfulEvent = ValidateEvent<{
  event: "database_connection_successful";
  database: string;
  database_id: number;
  source: "setup" | "admin";
  dbms_version: string;
}>;

export type DatabaseConnectionFailedEvent = ValidateEvent<{
  event: "database_connection_failed";
  database: string;
  database_id: number;
  error_type: string;
  source: "setup" | "admin";
  dbms_version: string;
}>;

export type DatabaseEvent =
  | DatabaseConnectionSuccessfulEvent
  | DatabaseConnectionFailedEvent;
