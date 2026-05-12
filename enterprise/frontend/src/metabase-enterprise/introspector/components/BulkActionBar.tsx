import { t } from "ttag";

import { Button, Checkbox, Group, Paper, Text } from "metabase/ui";

interface Props {
  count: number;
  onTrash: () => void;
  onClear: () => void;
  isWorking?: boolean;
  /**
   * Optional checkbox for the transforms tab — when the user opts in, the parent
   * also calls `DELETE /api/transform/:id/table` before the transform delete.
   */
  alsoDeleteTargetTable?: {
    checked: boolean;
    onToggle: (next: boolean) => void;
  };
}

export function BulkActionBar({
  count,
  onTrash,
  onClear,
  isWorking,
  alsoDeleteTargetTable,
}: Props) {
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
        <Group gap="md">
          <Text fw={500} c="text-primary-inverse">
            {t`${count} selected`}
          </Text>
          {alsoDeleteTargetTable && (
            <Checkbox
              checked={alsoDeleteTargetTable.checked}
              onChange={(e) =>
                alsoDeleteTargetTable.onToggle(e.currentTarget.checked)
              }
              disabled={isWorking}
              label={
                <Text c="text-primary-inverse" size="sm">
                  {t`Also drop target tables`}
                </Text>
              }
            />
          )}
        </Group>
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
