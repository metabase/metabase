import type { TableId } from "metabase-types/api";

export const COLUMN_ROLES = [
  "timestamp",
  "person",
  "session",
  "event_id",
  "event_name",
  "url_path",
] as const;

export type ColumnRole = (typeof COLUMN_ROLES)[number];

/** Which table column plays each role, by name. `null` means none does. */
export type ColumnRoles = Record<ColumnRole, string | null>;

/** The names the planners read on `events_base`. */
export const PLANNER_COLUMN_NAMES: Record<ColumnRole, string> = {
  timestamp: "created_at",
  person: "person_id",
  session: "session_id",
  event_id: "event_id",
  event_name: "event_name",
  url_path: "url_path",
};

/**
 * The event table column that's true once the person has been identified, as
 * of each event, and empty before.
 */
export const IDENTIFIED_COLUMN = "person__identified";

/** How the event table reaches the users table its person column links to. */
export type UsersTableLink = {
  tableId: TableId;
  /** The event table column that holds the users table key. */
  foreignKey: string;
  /** The users table column the foreign key points to. */
  primaryKey: string;
};

/** A column an analysis reads on `events_base` beyond the roles. */
export type ExtraColumn = {
  /** The name the planners read it under. */
  as: string;
  column: string;
  from: "events" | "users";
};

/** An extra column as the compiled base query returns it. */
export type ProjectedColumn = {
  as: string;
  /** The column's alias in the compiled base SQL. */
  alias: string;
};
