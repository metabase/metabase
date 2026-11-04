import { t } from "ttag";

import {
  type HistoryCheckId,
  type HistoryEntity,
  type HistoryVersion,
  useHistoryReviewStatus,
} from "metabase/metadata/table-structure";
import { ActionIcon, Box, Card, Group, Icon, Text } from "metabase/ui";
import type { RowValue, Table } from "metabase-types/api";

import {
  HistoryPreviewGrid,
  type PreviewColumn,
  formatDate,
} from "../TableSection/TableHistory";

type PreviewRow = { entity: HistoryEntity; version: HistoryVersion };

const displayValue = (value: RowValue | undefined) =>
  value == null || typeof value === "object" ? null : value;

export function HistoryCheckPreview({
  className,
  table,
  checkId,
  onClose,
}: {
  className?: string;
  table: Table;
  checkId: HistoryCheckId;
  onClose: () => void;
}) {
  const status = useHistoryReviewStatus(table);
  const profile =
    status?.profileState.status === "loaded"
      ? status.profileState.profile
      : undefined;
  const check = profile?.checks.find((check) => check.id === checkId);
  const affectedKeys = new Set(check?.entityKeys ?? []);
  const rows: PreviewRow[] = (profile?.entities ?? [])
    .filter((entity) => affectedKeys.has(entity.key))
    .flatMap((entity) =>
      entity.versions.map((version) => ({ entity, version })),
    );
  const changingColumns = (profile?.columns ?? []).filter(
    (column) => column.changeCount > 0,
  );
  const columns: PreviewColumn<PreviewRow>[] = [
    {
      id: "key",
      name: profile?.durableKeyField.display_name ?? t`Key`,
      value: (row) => row.entity.key,
    },
    {
      id: "valid-from",
      name: t`Valid from`,
      value: (row) => formatDate(row.version.validFrom),
    },
    {
      id: "valid-to",
      name: t`Valid to`,
      value: (row) => formatDate(row.version.validTo),
    },
    {
      id: "current",
      name: t`Current`,
      value: (row) => (row.version.isCurrent ? t`Yes` : t`No`),
    },
    ...changingColumns.map(
      (column): PreviewColumn<PreviewRow> => ({
        id: column.field.name,
        name: column.field.display_name,
        value: (row) => displayValue(row.version.values[column.field.name]),
      }),
    ),
  ];

  return (
    <Card
      className={className}
      data-testid="history-check-preview"
      h="100%"
      px="xl"
      py="lg"
      withBorder
    >
      <Group justify="space-between" wrap="nowrap">
        <Text fw="bold">{t`Affected records`}</Text>
        <ActionIcon variant="subtle" aria-label={t`Close`} onClick={onClose}>
          <Icon name="close" />
        </ActionIcon>
      </Group>
      <Text size="sm" c="text-secondary" py="sm">
        {t`${rows.length.toLocaleString()} records`}
      </Text>
      <Box
        flex={1}
        mih={0}
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="md"
        style={{ overflow: "hidden" }}
      >
        <HistoryPreviewGrid rows={rows} columns={columns} />
      </Box>
    </Card>
  );
}
