import { t } from "ttag";

import type { DataLayer } from "metabase/metadata/data-layers";
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
  dataLayer,
}: {
  table: Pick<Table, "visibility_type">;
  role: TableRole | null;
  dataLayer: DataLayer | undefined;
}): string | null {
  if (table.visibility_type != null) {
    return t`Hidden in the table's settings`;
  }
  if (dataLayer?.visibility === "hidden") {
    return t`In the ${dataLayer.name} data layer, which is hidden`;
  }
  if (role != null && ROLES_HIDDEN_BY_DEFAULT.includes(role)) {
    return t`${getTableRoleLabel(role)} tables are hidden by default`;
  }
  return null;
}
