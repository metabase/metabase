import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

export const COLUMN_ROLES = [
  "timestamp",
  "person",
  "session",
  "event_name",
  "url_path",
] as const;

export type ColumnRole = (typeof COLUMN_ROLES)[number];

/** Which table column plays each role, by name. `null` means none does. */
export type ColumnRoles = Record<ColumnRole, string | null>;

/** Roles no analysis can run without. */
export const REQUIRED_COLUMN_ROLES: readonly ColumnRole[] = [
  "timestamp",
  "person",
];

/** Until the table loads, any stored column is assumed to exist. */
export const isColumnIn = (
  fields: Field[] | undefined,
  name: unknown,
  accepts: (field: Field) => boolean = () => true,
): boolean =>
  name === null ||
  (typeof name === "string" &&
    (fields === undefined ||
      fields.some((field) => field.name === name && accepts(field))));

export const isColumnInTable = (
  table: Table | undefined,
  name: unknown,
): boolean => isColumnIn(table?.fields, name);

export const isDateColumnInTable = (
  table: Table | undefined,
  name: unknown,
): boolean => isColumnIn(table?.fields, name, isDate);

const toOptions = (fields: Field[]) =>
  fields.map((field) => ({
    value: field.name,
    label: field.display_name,
  }));

export const getColumnOptions = (table: Table | undefined) =>
  toOptions(table?.fields ?? []);

export const getDateColumnOptions = (table: Table | undefined) =>
  toOptions((table?.fields ?? []).filter(isDate));
