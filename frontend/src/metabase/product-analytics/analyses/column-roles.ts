import { getColumnIcon } from "metabase/common/utils/columns";
import {
  type ColumnRoles,
  type StoredSettings,
  getEventTableSettings,
  isColumnIn,
  isColumnInTable,
} from "metabase/event-tables";
import * as Lib from "metabase-lib";
import {
  isBoolean,
  isCategory,
  isDate,
  isFK,
  isPK,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import type { UsersTableLink } from "../columns";

import type { AnalysisContext } from "./types";

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
    : getEventTableSettings(table)["columns.person"];
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
