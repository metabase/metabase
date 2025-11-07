import { t } from "ttag";

import { Group, Stack, Text } from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props {
  table: Table;
}

export function TableMetadataInfo({ table }: Props) {
  const formattedDate = new Date(table.updated_at).toLocaleString();

  return (
    <Stack gap="md">
      <MetadataRow label={t`Name on disk`} value={table.name} />
      <MetadataRow label={t`Last updated at`} value={formattedDate} />
      {/* TODO: Implement view count */}
      {/* TODO: Implement dependencies count */}
      {/* TODO: Implement dependents count */}
    </Stack>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between" ć>
      <Text size="md" c="text-primary">
        {label}
      </Text>
      <Text size="sm" c="text-primary">
        {value}
      </Text>
    </Group>
  );
}
