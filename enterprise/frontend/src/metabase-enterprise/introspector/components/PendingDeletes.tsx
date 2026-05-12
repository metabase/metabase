import { useEffect, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Stack, Text } from "metabase/ui";

import type { PendingDelete } from "../hooks/usePendingDeletes";

interface Props {
  pending: PendingDelete[];
  onRestore: (id: number) => void;
  onDeleteNow: (id: number) => void;
  onRestoreAll: () => void;
}

function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export function PendingDeletes({
  pending,
  onRestore,
  onDeleteNow,
  onRestoreAll,
}: Props) {
  const now = useTick(pending.length > 0);
  if (pending.length === 0) {
    return null;
  }
  return (
    <Box
      mt="lg"
      p="md"
      style={{
        background: "var(--mb-color-bg-light)",
        border: "1px solid var(--mb-color-border)",
        borderRadius: 8,
      }}
    >
      <Group justify="space-between" mb="sm">
        <Text fw={600} size="sm">
          {t`Recently deleted (${pending.length})`}
        </Text>
        <Group gap="xs">
          <Text size="xs" c="text-secondary">
            {t`Demo-only undo — transforms are hard-deleted on the backend, but the actual DELETE call is staged for 30s here so you can recover from a mis-click.`}
          </Text>
          <Button size="xs" variant="subtle" onClick={onRestoreAll}>
            {t`Restore all`}
          </Button>
        </Group>
      </Group>
      <Stack gap="xs">
        {pending.map((p) => {
          const remainingMs = Math.max(0, p.expiresAt - now);
          const remainingSec = Math.ceil(remainingMs / 1000);
          const targetSuffix =
            p.alsoDropTable && p.target_table?.active
              ? t` (with target table)`
              : "";
          return (
            <Group
              key={p.id}
              justify="space-between"
              wrap="nowrap"
              p="xs"
              style={{
                background: "var(--mb-color-bg-white)",
                border: "1px solid var(--mb-color-border)",
                borderRadius: 6,
              }}
            >
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                <Text size="sm" fw={500} truncate>
                  {p.name}
                  {targetSuffix && (
                    <Text component="span" c="text-secondary" size="xs">
                      {targetSuffix}
                    </Text>
                  )}
                </Text>
                <Text
                  size="xs"
                  c="text-secondary"
                  style={{ whiteSpace: "nowrap" }}
                >
                  {t`Deleting in ${remainingSec}s…`}
                </Text>
              </Group>
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="compact-xs"
                  variant="default"
                  onClick={() => onRestore(p.id)}
                >
                  {t`Restore`}
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="error"
                  onClick={() => onDeleteNow(p.id)}
                >
                  {t`Delete now`}
                </Button>
              </Group>
            </Group>
          );
        })}
      </Stack>
    </Box>
  );
}
