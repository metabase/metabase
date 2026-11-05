import { msgid, ngettext, t } from "ttag";

import {
  getFailedChecks,
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
  const signal = structure.isScdTypeOverridden
    ? t`Set by an admin`
    : getHistorySignalLabel(structure.scdTypeInference.rule);
  const failingCount =
    status.profileState.status === "loaded"
      ? getFailedChecks(status.profileState.profile).length
      : 0;
  const parts = [
    signal,
    ...(status.isConfirmed ? [t`reviewed`] : []),
    ...(failingCount > 0
      ? [
          ngettext(
            msgid`${failingCount} failing check`,
            `${failingCount} failing checks`,
            failingCount,
          ),
        ]
      : []),
  ];
  const summary = parts.join(" · ");
  return (
    <Text c="text-secondary" size="sm" truncate title={summary}>
      {summary}
    </Text>
  );
}
