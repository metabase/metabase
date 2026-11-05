import { t } from "ttag";

import {
  getTableSubjectIcon,
  getTableSubjectLabel,
  useSemanticTypes,
} from "metabase/metadata/semantic-types";
import { useTableFields } from "metabase/metadata/table-structure";
import { Group, Icon, Text, Tooltip } from "metabase/ui";
import type { Table } from "metabase-types/api";

export function TableSubjectCell({ table }: { table: Table }) {
  const fields = useTableFields(table);
  const { getTableSubject } = useSemanticTypes();

  if (fields == null) {
    return null;
  }

  const { subject, needsReview, inference } = getTableSubject({
    ...table,
    fields,
  });

  return (
    <Group gap="sm" wrap="nowrap" miw={0} data-testid="table-subject">
      <Icon name={getTableSubjectIcon(subject)} c="text-secondary" />
      {subject ? (
        <Text truncate>{getTableSubjectLabel(subject)}</Text>
      ) : (
        <Text c="text-secondary">{t`No subject`}</Text>
      )}
      {needsReview && (
        <Tooltip label={t`Needs review. ${inference.signal}`}>
          <Icon name="flag" c="icon-secondary" aria-label={t`Needs review`} />
        </Tooltip>
      )}
    </Group>
  );
}
