import { t } from "ttag";

import {
  getHistorySignalLabel,
  isRoleA,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

export function HistoryListSummary({
  table,
}: {
  table: Table & { fields: Field[] };
}) {
  const structure = useTableStructures().getTableStructure(table);
  const status = useHistoryReviewStatus(table);
  const isHistory =
    structure.role != null && isRoleA(structure.role, "role/HistoryDimension");
  if (!isHistory || status == null) {
    return null;
  }
  const summary = structure.isScdTypeOverridden
    ? t`Set by an admin`
    : getHistorySignalLabel(structure.scdTypeInference.rule);
  return (
    <Text c="text-secondary" size="sm" truncate title={summary}>
      {summary}
    </Text>
  );
}
