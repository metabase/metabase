import { msgid, ngettext, t } from "ttag";

import {
  getHistorySignalLabel,
  isRoleA,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { countFailingChecks } from "metabase/metadata/table-structure/generated-checks";
import { Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { useHistoryChecks } from "./use-history-checks";

export function HistoryListSummary({
  table,
}: {
  table: Table & { fields: Field[] };
}) {
  const structure = useTableStructures().getTableStructure(table);
  const status = useHistoryReviewStatus(table);
  const generated = useHistoryChecks(table);
  const isHistory =
    structure.role != null && isRoleA(structure.role, "role/HistoryDimension");
  if (!isHistory || status == null) {
    return null;
  }
  const signal = structure.isScdTypeOverridden
    ? t`Set by an admin`
    : getHistorySignalLabel(structure.scdTypeInference.rule);
  const failingCount = generated
    ? countFailingChecks(generated.checks, generated.results)
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
