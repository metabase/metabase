import { t } from "ttag";

import { getDataSensitivityLabel } from "metabase/common/utils/data-sensitivity";
import { getSemanticTypeName } from "metabase/common/utils/fields";
import type { BadgeColor } from "metabase/ui";
import type {
  DataSensitivityConfidence,
  DataSensitivityDatabaseResult,
  DataSensitivityFieldResult,
  DataSensitivityFieldStatus,
  DataSensitivityTableError,
  DataSensitivityTableResult,
} from "metabase-types/api";

export type DataSensitivityRow = {
  id: DataSensitivityFieldResult["field_id"];
  table: string;
  field: string;
  current: string;
  humanSet: boolean;
  proposed: string;
  reasoning: string | null;
  confidence: string;
  semanticType: string;
  status: DataSensitivityFieldStatus;
};

export function isDataSensitivityTableError(
  table: DataSensitivityTableResult | DataSensitivityTableError,
): table is DataSensitivityTableError {
  return "error" in table;
}

export function getTableResults(result: DataSensitivityDatabaseResult) {
  return result.tables.filter(
    (table): table is DataSensitivityTableResult =>
      !isDataSensitivityTableError(table),
  );
}

export function getTableErrors(result: DataSensitivityDatabaseResult) {
  return result.tables.filter(isDataSensitivityTableError);
}

export function getStatusLabel(status: DataSensitivityFieldStatus): string {
  switch (status) {
    case "agree":
      return t`Agrees`;
    case "disagree":
      return t`Differs`;
    case "new":
      return t`New`;
    case "abstain":
      return t`Unsure`;
    case "dropped":
      return t`No answer`;
  }
}

export function getStatusColor(status: DataSensitivityFieldStatus): BadgeColor {
  switch (status) {
    case "agree":
      return "positive";
    case "disagree":
      return "warning";
    case "new":
      return "brand";
    case "abstain":
    case "dropped":
      return "neutral";
  }
}

// Differences sort first so the rows worth reviewing lead the table.
const STATUS_SORT_ORDER: Record<DataSensitivityFieldStatus, number> = {
  disagree: 0,
  new: 1,
  abstain: 2,
  dropped: 3,
  agree: 4,
};

export function getStatusSortRank(status: DataSensitivityFieldStatus): number {
  return STATUS_SORT_ORDER[status];
}

function getConfidenceLabel(
  confidence: DataSensitivityConfidence | null,
): string {
  switch (confidence) {
    case "high":
      return t`High`;
    case "medium":
      return t`Medium`;
    case "low":
      return t`Low`;
    case null:
      return "";
  }
}

function getTableLabel(table: DataSensitivityTableResult): string {
  return table.schema
    ? `${table.schema}.${table.table_name}`
    : table.table_name;
}

function toRow(
  table: DataSensitivityTableResult,
  field: DataSensitivityFieldResult,
): DataSensitivityRow {
  const { current, proposed } = field;
  return {
    id: field.field_id,
    table: getTableLabel(table),
    field: field.display_name ?? field.name,
    current: current.data_sensitivity
      ? getDataSensitivityLabel(current.data_sensitivity)
      : t`Not scanned`,
    humanSet: current.human_set,
    proposed: proposed.data_sensitivity
      ? getDataSensitivityLabel(proposed.data_sensitivity)
      : "",
    reasoning: proposed.reasoning,
    confidence: getConfidenceLabel(proposed.confidence),
    semanticType:
      proposed.semantic_type && field.semantic_changed
        ? (getSemanticTypeName(proposed.semantic_type) ??
          proposed.semantic_type)
        : "",
    status: field.status,
  };
}

export function getDataSensitivityRows(
  tables: DataSensitivityTableResult[],
): DataSensitivityRow[] {
  return tables.flatMap((table) =>
    table.fields.map((field) => toRow(table, field)),
  );
}
