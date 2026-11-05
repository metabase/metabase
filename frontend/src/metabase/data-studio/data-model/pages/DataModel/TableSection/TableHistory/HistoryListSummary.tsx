import { t } from "ttag";

import {
  getHistorySignalLabel,
  isRoleA,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { useScdDetails } from "./use-scd-details";

const DEFAULT_HISTORY_SCD_TYPE = 2;

export function HistoryListSummary({
  table,
}: {
  table: Table & { fields: Field[] };
}) {
  const structure = useTableStructures().getTableStructure(table);
  const status = useHistoryReviewStatus(table);
  const { resolution } = useScdDetails(table);
  const isHistory =
    structure.role != null && isRoleA(structure.role, "role/HistoryDimension");
  if (!isHistory || status == null) {
    return null;
  }
  const source = structure.isScdTypeOverridden
    ? t`Set by an admin`
    : getHistorySignalLabel(structure.scdTypeInference.rule);
  const { scdType } = resolution;
  const summary =
    scdType != null && scdType !== DEFAULT_HISTORY_SCD_TYPE
      ? t`Type ${scdType} · ${source}`
      : source;
  return (
    <Text c="text-secondary" size="sm" truncate title={summary}>
      {summary}
    </Text>
  );
}
