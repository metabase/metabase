import { t } from "ttag";

import {
  getFailedChecks,
  useHistoryReview,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { Badge, Button, Group, Loader, Text } from "metabase/ui";
import type { Table } from "metabase-types/api";

const DATA_QUALITY_URL = "https://github.com/metabase/data-quality";

export function HistoryChecksStatus({
  table,
  readOnly,
}: {
  table: Table;
  readOnly: boolean;
}) {
  const status = useHistoryReviewStatus(table);
  const structure = useTableStructures().getTableStructure(table);
  const { confirm } = useHistoryReview(table);
  if (status == null) {
    return null;
  }
  const { profileState } = status;
  const failingCount =
    profileState.status === "loaded"
      ? getFailedChecks(profileState.profile).length
      : null;
  const canConfirm = !readOnly && status.needsReview;

  return (
    <Group gap="sm" justify="space-between" wrap="nowrap">
      <Group gap="xs" miw={0}>
        <Text>{t`In data quality`}</Text>
        {failingCount == null && profileState.status !== "unbound" && (
          <Loader size="xs" />
        )}
        {failingCount != null && failingCount > 0 && (
          <Badge color="warning" variant="light" flex="0 0 auto">
            {t`${failingCount} failing`}
          </Badge>
        )}
        {failingCount === 0 && <Text c="text-secondary">{t`all passing`}</Text>}
      </Group>
      <Group gap="xs" wrap="nowrap" flex="0 0 auto">
        {canConfirm && (
          <Button
            size="compact-sm"
            variant="filled"
            onClick={() => confirm(structure)}
          >
            {t`Confirm`}
          </Button>
        )}
        <Button
          component="a"
          href={DATA_QUALITY_URL}
          target="_blank"
          rel="noreferrer"
          size="compact-sm"
        >
          {t`View in data quality`}
        </Button>
      </Group>
    </Group>
  );
}
