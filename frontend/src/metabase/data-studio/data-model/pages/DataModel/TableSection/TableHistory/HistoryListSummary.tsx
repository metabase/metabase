import { msgid, ngettext, t } from "ttag";

import {
  getFailedChecks,
  getHistorySignalLabel,
  getWarningChecks,
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
  const profile =
    status.profileState.status === "loaded"
      ? status.profileState.profile
      : null;
  const issueCount = profile
    ? getFailedChecks(profile).length + getWarningChecks(profile).length
    : 0;
  const parts = [
    signal,
    ...(status.isConfirmed ? [t`reviewed`] : []),
    ...(issueCount > 0
      ? [
          ngettext(
            msgid`${issueCount} issue`,
            `${issueCount} issues`,
            issueCount,
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
