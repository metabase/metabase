import { isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  EventTableColumnRole,
  EventTableSettingKey,
  Field,
  FieldVisibilityType,
  Table,
} from "metabase-types/api";

export const EVENT_TABLE_ENTITY_TYPE = "entity/EventTable";

export const REQUIRED_COLUMN_ROLES = [
  "timestamp",
  "person",
] as const satisfies readonly EventTableColumnRole[];

export const OPTIONAL_COLUMN_ROLES = [
  "event_name",
  "session",
] as const satisfies readonly EventTableColumnRole[];

/** The roles the Events tab edits. */
export type EditableColumnRole =
  | (typeof REQUIRED_COLUMN_ROLES)[number]
  | (typeof OPTIONAL_COLUMN_ROLES)[number];

export function isEventTable(table: Pick<Table, "entity_type">): boolean {
  return table.entity_type === EVENT_TABLE_ENTITY_TYPE;
}

export function getColumnRoleKey(
  role: EventTableColumnRole,
): EventTableSettingKey {
  return `columns.${role}`;
}

const EXCLUDED_VISIBILITY_TYPES: ReadonlySet<FieldVisibilityType> = new Set([
  "sensitive",
  "retired",
]);

/**
 * The table's columns that can play `role`. Sensitive ("Do not include") and
 * retired columns can't play any role, because queries can't use them.
 */
export function getColumnRoleFields(
  table: Pick<Table, "fields">,
  role: EventTableColumnRole,
): Field[] {
  const fields = (table.fields ?? []).filter(
    (field) =>
      field.parent_id == null &&
      !EXCLUDED_VISIBILITY_TYPES.has(field.visibility_type),
  );
  return role === "timestamp" ? fields.filter(isDate) : fields;
}

/**
 * The name of the column a user set for `role`, or `null` when none is set or
 * the column can't play the role, for example because it was dropped.
 */
export function getColumnRoleValue(
  table: Pick<Table, "fields" | "event_settings">,
  role: EventTableColumnRole,
): string | null {
  const columnName = table.event_settings?.[getColumnRoleKey(role)];
  const fits =
    columnName != null &&
    getColumnRoleFields(table, role).some((field) => field.name === columnName);
  return fits ? columnName : null;
}

/**
 * Whether product analysis can use the table: it's an event table, and a
 * column is set for every required role. When the table has its fields, each
 * column must also still be in the table and fit its role. Without them, as in
 * `GET /api/table`, only the column names in its settings are checked.
 */
export function isEventTableSetUp(
  table: Pick<Table, "entity_type" | "fields" | "event_settings">,
): boolean {
  const hasColumn = (role: EventTableColumnRole) =>
    table.fields === undefined
      ? table.event_settings?.[getColumnRoleKey(role)] != null
      : getColumnRoleValue(table, role) != null;
  return isEventTable(table) && REQUIRED_COLUMN_ROLES.every(hasColumn);
}
