import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import { TYPE } from "metabase-lib/v1/types/constants";
import {
  isBoolean,
  isCategory,
  isDate,
  isFK,
  isPK,
  isString,
  isa,
} from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import type { ColumnRole, ColumnRoles, UsersTableLink } from "../columns";
import type { StoredSettings } from "../settings/types";

import type { AnalysisContext } from "./types";

type RoleRule = {
  semanticType?: string;
  /** Lowercase column names, most likely first. */
  names: string[];
  accepts?: (field: Field) => boolean;
  /** Use the first accepted column when nothing else matches. */
  fallBackToAnyAccepted?: boolean;
};

const ROLE_RULES: Record<ColumnRole, RoleRule> = {
  timestamp: {
    semanticType: TYPE.CreationTimestamp,
    names: ["created_at", "timestamp", "event_time", "time", "ts"],
    accepts: isDate,
    fallBackToAnyAccepted: true,
  },
  person: {
    semanticType: TYPE.User,
    names: ["person_id", "user_id", "distinct_id", "visitor_id"],
  },
  session: {
    names: ["session_id"],
  },
  event_id: {
    names: ["event_id", "id"],
  },
  event_name: {
    names: ["event_name", "event", "action"],
    accepts: isString,
  },
  url_path: {
    semanticType: TYPE.URL,
    names: ["url_path", "path", "page_path", "pathname"],
    accepts: isString,
  },
};

/** Picks a column for a role: by semantic type, then by name, then by type. */
export const getDefaultColumn = (
  table: Table | undefined,
  role: ColumnRole,
): string | null => {
  const { semanticType, names, accepts, fallBackToAnyAccepted } =
    ROLE_RULES[role];
  const fields = (table?.fields ?? []).filter(
    (field) => accepts?.(field) ?? true,
  );

  const bySemanticType =
    semanticType !== undefined
      ? fields.find((field) => isa(field.semantic_type, semanticType))
      : undefined;
  const byName = names
    .map((name) => fields.find((field) => field.name.toLowerCase() === name))
    .find((field) => field !== undefined);
  const byType = fallBackToAnyAccepted ? fields[0] : undefined;

  return (bySemanticType ?? byName ?? byType)?.name ?? null;
};

/** Until the table loads, any stored column is assumed to exist. */
const isColumnIn = (
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

/**
 * The person column before the settings are computed: the stored one when
 * the table has it, else the default. Lets the users table load before the
 * settings that read it.
 */
export const getPersonColumn = (
  table: Table | undefined,
  stored: StoredSettings,
): string | null => {
  const value = stored["columns.person"];
  return typeof value === "string" && isColumnInTable(table, value)
    ? value
    : getDefaultColumn(table, "person");
};

/** The table the person column's foreign key points to, if any. */
export const getUsersTableLink = (
  table: Table | undefined,
  personColumn: string | null,
): UsersTableLink | undefined => {
  if (table === undefined) {
    return undefined;
  }
  const field = table.fields?.find((item) => item.name === personColumn);
  // `query_metadata` sends `target: null` on fields without a foreign key.
  const target = field?.target;
  if (field === undefined || target == null) {
    return undefined;
  }
  return target.table_id === table.id
    ? undefined
    : {
        tableId: target.table_id,
        foreignKey: field.name,
        primaryKey: target.name,
      };
};

/** A column that describes a person rather than an event. */
const isUserProperty = (field: Field): boolean =>
  !isDate(field) &&
  !isPK(field) &&
  !isFK(field) &&
  (isString(field) || isBoolean(field) || isCategory(field));

const getUserPropertyFields = (context: AnalysisContext): Field[] | undefined =>
  context.usersTable !== undefined
    ? context.usersTable.table.fields?.filter(
        (field) =>
          field.name !== context.usersTable?.link.primaryKey && !isFK(field),
      )
    : context.table?.fields?.filter(isUserProperty);

/**
 * Columns to group people by: the users table's when there is one, else the
 * event table's columns that look like user properties. Role columns are left
 * out, since they identify events rather than describe people.
 */
export const getUserPropertyOptions = (
  context: AnalysisContext,
  roles: ColumnRoles,
) => {
  const roleColumns = new Set(Object.values(roles));
  return (getUserPropertyFields(context) ?? [])
    .filter(
      (field) =>
        context.usersTable !== undefined || !roleColumns.has(field.name),
    )
    .map((field) => ({
      value: field.name,
      label: field.display_name,
      icon: getColumnIcon(
        Lib.legacyColumnTypeInfo({
          effective_type: field.effective_type,
          semantic_type: field.semantic_type,
        }),
      ),
    }));
};

export const isUserPropertyColumn = (
  context: AnalysisContext,
  name: unknown,
): boolean => isColumnIn(getUserPropertyFields(context), name);
