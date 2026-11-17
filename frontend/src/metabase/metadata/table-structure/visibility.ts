import { t } from "ttag";

import type { Table } from "metabase-types/api";

import { type TableRole, getTableRoleLabel } from "./roles";

// Day-one defaults in the spec: bookkeeping, list items and translations are
// technical tables nobody browses
const ROLES_HIDDEN_BY_DEFAULT: TableRole[] = [
  "role/SystemTable",
  "role/ArrayChild",
  "role/TranslationTable",
];

/**
 * Why a table is hidden from people, or `null` when it isn't. Every hidden
 * table names the rule that hid it.
 */
export function getTableHiddenReason({
  table,
  role,
}: {
  table: Pick<Table, "visibility_type">;
  role: TableRole | null;
}): string | null {
  if (table.visibility_type != null) {
    return t`Hidden in the table's settings`;
  }
  if (role != null && ROLES_HIDDEN_BY_DEFAULT.includes(role)) {
    return t`${getTableRoleLabel(role)} tables are hidden by default`;
  }
  return null;
}
