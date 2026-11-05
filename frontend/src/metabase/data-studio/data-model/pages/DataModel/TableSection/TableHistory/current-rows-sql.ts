import _ from "underscore";

import type { HistoryBinding } from "metabase/metadata/table-structure";
import { getHistoryCurrentCondition } from "metabase/metadata/table-structure/generated-checks";
import type { Field, FieldId, Table } from "metabase-types/api";

const RANK_COLUMN = "version_rank";
const INDENT = "  ";

function nameOf(fields: Field[], fieldId: FieldId | null) {
  return fields.find((field) => field.id === fieldId)?.name ?? null;
}

function getTableName(table: Pick<Table, "schema" | "name">) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

export function buildCurrentRowsSql(
  table: Pick<Table, "schema" | "name">,
  fields: Field[],
  binding: HistoryBinding,
): string | null {
  const keyName = nameOf(fields, binding.durableKeyFieldId);
  const validFromName = nameOf(fields, binding.validFromFieldId);
  if (keyName == null || validFromName == null) {
    return null;
  }
  const validToName = nameOf(fields, binding.validToFieldId);
  const currentFlagName = nameOf(fields, binding.currentFlagFieldId);
  const versionName = nameOf(fields, binding.versionFieldId);

  const columns = fields.map((field) => `${INDENT}${field.name}`).join(",\n");
  const orderBy = _.uniq([validFromName, versionName])
    .filter((name) => name != null)
    .map((name) => `${name} DESC`)
    .join(", ");
  const currentCondition = getHistoryCurrentCondition({
    validTo: validToName,
    currentFlag: currentFlagName,
  });
  const where = currentCondition ? `\n${INDENT}WHERE ${currentCondition}` : "";

  return `SELECT
${columns}
FROM (
${INDENT}SELECT
${INDENT}  *,
${INDENT}  ROW_NUMBER() OVER (
${INDENT}    PARTITION BY ${keyName}
${INDENT}    ORDER BY ${orderBy}
${INDENT}  ) AS ${RANK_COLUMN}
${INDENT}FROM ${getTableName(table)}${where}
) AS versions
WHERE ${RANK_COLUMN} = 1`;
}
