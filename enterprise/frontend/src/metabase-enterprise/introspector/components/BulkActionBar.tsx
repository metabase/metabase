import { t } from "ttag";

import { Button, Checkbox, Group, Paper, Text } from "metabase/ui";

interface Props {
  count: number;
  onTrash: () => void;
  onClear: () => void;
  isWorking?: boolean;
  /**
   * Transforms-only: optional toggle to also drop the warehouse target table
   * before archiving. The parent owns the boolean state; we just render the
   * checkbox.
   */
  alsoDropTable?: {
    checked: boolean;
    onToggle: (next: boolean) => void;
  };
}

export function BulkActionBar({
  count,
  onTrash,
  onClear,
  isWorking,
  alsoDropTable,
}: Props) {
  if (count === 0) {
    return null;
  }
  return (
    <Paper
      withBorder
      p="md"
      shadow="md"
      pos="sticky"
      bottom={16}
      mt="md"
      // Opaque background. NOTE: `--mb-color-bg-dark` is NOT a defined token in
      // the Metabase color system — using it falls back to transparent, which
      // is why this bar looked translucent before. The real opaque-dark token
      // is `--mb-color-background-primary-inverse` (same one the canonical
      // `Card dark` component at frontend/src/metabase/common/components/Card
      // uses). `opacity: 1` is belt-and-suspenders against an inherited
      // transparency from a wrapping Paper or theme override.
      style={{
        background: "var(--mb-color-background-primary-inverse)",
        color: "var(--mb-color-text-primary-inverse)",
        opacity: 1,
      }}
    >
      <Group justify="space-between" wrap="wrap" gap="md">
        <Group gap="md" wrap="wrap">
          <Text fw={500} c="text-primary-inverse">
            {t`${count} selected`}
          </Text>
          {alsoDropTable && (
            <Checkbox
              checked={alsoDropTable.checked}
              onChange={(e) => alsoDropTable.onToggle(e.currentTarget.checked)}
              disabled={isWorking}
              label={
                <Text c="text-primary-inverse" size="sm">
                  {t`Also drop target tables`}
                </Text>
              }
            />
          )}
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Button variant="subtle" onClick={onClear} disabled={isWorking}>
            {t`Cancel`}
          </Button>
          <Button color="error" onClick={onTrash} loading={isWorking}>
            {t`Move to Trash`}
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
