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
  // Only sync's guess needs a reason; an admin's choice speaks for itself
  if (!isHistory || status == null || structure.isScdTypeOverridden) {
    return null;
  }
  const summary = getHistorySignalLabel(structure.scdTypeInference.rule);
  return (
    <Text c="text-secondary" size="sm" truncate title={summary}>
      {summary}
    </Text>
  );
}
