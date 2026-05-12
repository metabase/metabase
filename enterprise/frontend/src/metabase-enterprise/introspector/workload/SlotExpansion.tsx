import { t } from "ttag";

import { Anchor, Badge, Box, Skeleton, Table, Text, Title } from "metabase/ui";

import type { WorkloadJobType, WorkloadSlotRow } from "./types";

type Props = {
  slot: string | null;
  rows: WorkloadSlotRow[] | undefined;
  isLoading: boolean;
};

const BADGE_COLOR: Record<WorkloadJobType, string> = {
  sync: "blue",
  "transform-job": "orange",
  notification: "green",
  "persisted-refresh": "violet",
  other: "gray",
};

export function SlotExpansion({ slot, rows, isLoading }: Props) {
  if (!slot) {
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
        <Text c="text-secondary" size="sm">
          {t`Click a cell to see the jobs scheduled in that hour.`}
        </Text>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box mt="lg" p="md">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={28} mt={i ? "xs" : 0} />
        ))}
      </Box>
    );
  }

  if (!rows || rows.length === 0) {
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
        <Text c="text-secondary" size="sm">
          {t`Nothing scheduled in this hour.`}
        </Text>
      </Box>
    );
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
      <Title order={5} mb="xs">
        {t`${slot.replace("T", " · ")}:00 UTC`}
      </Title>
      <Table striped withTableBorder={false} verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t`Type`}</Table.Th>
            <Table.Th>{t`Entity`}</Table.Th>
            <Table.Th>{t`Cron`}</Table.Th>
            <Table.Th>{t`Fires at`}</Table.Th>
            <Table.Th>{t`Weight`}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={`${r.type}-${r.entity_id ?? "x"}-${r.fire_at}-${i}`}>
              <Table.Td>
                <Badge color={BADGE_COLOR[r.type]} variant="light">
                  {r.type}
                </Badge>
              </Table.Td>
              <Table.Td>
                {r.entity_name ?? (
                  <Text c="text-secondary" component="span">
                    {t`(orphaned)`}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Text ff="monospace" size="xs">
                  {r.cron ?? "—"}
                </Text>
              </Table.Td>
              <Table.Td>{new Date(r.fire_at).toLocaleString()}</Table.Td>
              <Table.Td>{r.weight}</Table.Td>
              <Table.Td>
                {r.settings_url ? (
                  <Anchor
                    href={r.settings_url}
                    size="sm"
                  >{t`Reschedule…`}</Anchor>
                ) : null}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
