import { t } from "ttag";

import { ActionIcon, Group, Icon, Text } from "metabase/ui";

interface Props {
  total: number;
  offset: number;
  limit: number;
  onChange: (offset: number) => void;
}

export function Pagination({ total, offset, limit, onChange }: Props) {
  if (total === 0) {
    return null;
  }
  const start = offset + 1;
  const end = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = end < total;

  return (
    <Group justify="space-between" mt="md" mb="md">
      <Text c="text-secondary" size="sm">
        {t`Showing ${start}-${end} of ${total}`}
      </Text>
      <Group gap="xs">
        <ActionIcon
          variant="default"
          disabled={!canPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
          aria-label={t`Previous page`}
        >
          <Icon name="chevronleft" />
        </ActionIcon>
        <ActionIcon
          variant="default"
          disabled={!canNext}
          onClick={() => onChange(offset + limit)}
          aria-label={t`Next page`}
        >
          <Icon name="chevronright" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
