import { t } from "ttag";

import { Anchor, Badge, Box, Skeleton, Text, Title } from "metabase/ui";

import type { WorkloadJobType, WorkloadSlotRow } from "./types";

type Props = {
  slot: string | null;
  rows: WorkloadSlotRow[] | undefined;
  isLoading: boolean;
};

const BADGE_COLOR: Record<
  WorkloadJobType,
  "brand" | "warning" | "success" | "summarize" | "text-secondary"
> = {
  sync: "brand",
  "transform-job": "warning",
  notification: "success",
  "persisted-refresh": "summarize",
  other: "text-secondary",
};

const cellStyle = {
  padding: "8px 4px",
  borderBottom: "1px solid var(--mb-color-border)",
  fontSize: 13,
} as const;

const headerStyle = {
  ...cellStyle,
  textAlign: "left" as const,
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  color: "var(--mb-color-text-secondary)",
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
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headerStyle}>{t`Type`}</th>
            <th style={headerStyle}>{t`Entity`}</th>
            <th style={headerStyle}>{t`Cron`}</th>
            <th style={headerStyle}>{t`Fires at`}</th>
            <th style={headerStyle}>{t`Weight`}</th>
            <th style={headerStyle} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.type}-${r.entity_id ?? "x"}-${r.fire_at}-${i}`}>
              <td style={cellStyle}>
                <Badge color={BADGE_COLOR[r.type]} variant="light">
                  {r.type}
                </Badge>
              </td>
              <td style={cellStyle}>
                {r.entity_name ?? (
                  <Text c="text-secondary" component="span">
                    {t`(orphaned)`}
                  </Text>
                )}
              </td>
              <td style={cellStyle}>
                <Text ff="monospace" size="xs">
                  {r.cron ?? "—"}
                </Text>
              </td>
              <td style={cellStyle}>{new Date(r.fire_at).toLocaleString()}</td>
              <td style={cellStyle}>{r.weight}</td>
              <td style={cellStyle}>
                {r.settings_url ? (
                  <Anchor
                    href={r.settings_url}
                    size="sm"
                  >{t`Reschedule…`}</Anchor>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
