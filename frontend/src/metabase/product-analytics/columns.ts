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
