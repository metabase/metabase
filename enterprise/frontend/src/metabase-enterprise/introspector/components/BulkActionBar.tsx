import { t } from "ttag";

import { Button, Group, Paper, Text } from "metabase/ui";

interface Props {
  count: number;
  onTrash: () => void;
  onClear: () => void;
  isWorking?: boolean;
}

export function BulkActionBar({ count, onTrash, onClear, isWorking }: Props) {
  if (count === 0) {
    return null;
  }
  return (
    <Paper
      withBorder
      p="md"
      shadow="sm"
      pos="sticky"
      bottom={16}
      mt="md"
      style={{
        background: "var(--mb-color-bg-dark)",
        color: "var(--mb-color-text-primary-inverse)",
      }}
    >
      <Group justify="space-between">
        <Text fw={500} c="text-primary-inverse">
          {t`${count} selected`}
        </Text>
        <Group gap="xs">
          <Button variant="subtle" onClick={onClear} disabled={isWorking}>
            {t`Cancel`}
          </Button>
          <Button color="error" onClick={onTrash} loading={isWorking}>
            {t`Send to Trash`}
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
