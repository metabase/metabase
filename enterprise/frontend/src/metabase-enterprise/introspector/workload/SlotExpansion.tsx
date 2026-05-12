import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Anchor,
  Badge,
  Box,
  Group,
  Skeleton,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import { getScheduleExplanation } from "metabase/utils/cron";

import type { WorkloadJobType, WorkloadSlotRow } from "./types";

type Props = {
  slot: string | null;
  rows: WorkloadSlotRow[] | undefined;
  isLoading: boolean;
};

type SortKey = "type" | "entity" | "cron" | "weight";
type SortDir = "asc" | "desc";

const BADGE_COLOR: Record<
  WorkloadJobType,
  "brand" | "warning" | "success" | "summarize"
> = {
  sync: "brand",
  "transform-job": "warning",
  alert: "success",
  "dashboard-subscription": "success",
  "persisted-refresh": "summarize",
};

const cellStyle = {
  padding: "8px 4px",
  borderBottom: "1px solid var(--mb-color-border)",
  fontSize: 13,
} as const;

const headerStyleBase = {
  ...cellStyle,
  textAlign: "left" as const,
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  color: "var(--mb-color-text-secondary)",
  userSelect: "none" as const,
};

const sortableHeader = (
  active: boolean,
  dir: SortDir,
  onClick: () => void,
  children: React.ReactNode,
) => (
  <th
    style={{ ...headerStyleBase, cursor: "pointer" }}
    onClick={onClick}
  >
    {children}
    {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
  </th>
);

function sortRows(
  rows: WorkloadSlotRow[],
  key: SortKey,
  dir: SortDir,
): WorkloadSlotRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: WorkloadSlotRow, b: WorkloadSlotRow) => {
    switch (key) {
      case "type":
        return sign * a.type.localeCompare(b.type);
      case "entity":
        return sign * (a.entity_name ?? "").localeCompare(b.entity_name ?? "");
      case "cron":
        return sign * (a.cron ?? "").localeCompare(b.cron ?? "");
      case "weight":
        return sign * (a.weight - b.weight);
    }
  };
  return [...rows].sort(cmp);
}

export function SlotExpansion({ slot, rows, isLoading }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("weight");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const visibleRows = useMemo(() => {
    if (!rows) {
      return [];
    }
    const q = query.trim().toLowerCase();
    const explainCron = (cron: string | null) => {
      if (!cron) {
        return "";
      }
      return getScheduleExplanation(cron)?.toLowerCase() ?? cron.toLowerCase();
    };
    const filtered = q
      ? rows.filter(
          (r) =>
            (r.entity_name ?? "").toLowerCase().includes(q) ||
            explainCron(r.cron).includes(q) ||
            r.type.toLowerCase().includes(q),
        )
      : rows;
    return sortRows(filtered, sortKey, sortDir);
  }, [rows, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "weight" ? "desc" : "asc");
    }
  };

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
      <Group justify="space-between" mb="sm" align="end">
        <Title order={5}>
          {t`${slot.replace("T", " · ")} UTC`}
        </Title>
        <Group gap="sm" align="center">
          <Text c="text-secondary" size="xs">
            {visibleRows.length === rows.length
              ? t`${rows.length} jobs`
              : t`${visibleRows.length} of ${rows.length}`}
          </Text>
          <TextInput
            size="xs"
            placeholder={t`Search name, schedule, or type…`}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            style={{ width: 240 }}
          />
        </Group>
      </Group>


      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {sortableHeader(sortKey === "type", sortDir, () => toggleSort("type"), t`Type`)}
            {sortableHeader(sortKey === "entity", sortDir, () => toggleSort("entity"), t`Entity`)}
            {sortableHeader(sortKey === "cron", sortDir, () => toggleSort("cron"), t`Schedule`)}
            {sortableHeader(sortKey === "weight", sortDir, () => toggleSort("weight"), t`Weight`)}
            <th style={headerStyleBase} />
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r, i) => (
            <tr key={`${r.type}-${r.entity_id ?? "x"}-${r.fire_at}-${i}`}>
              <td style={cellStyle}>
                <Badge color={BADGE_COLOR[r.type]} variant="light">
                  {r.type}
                </Badge>
              </td>
              <td style={cellStyle}>
                {r.entity_name && r.settings_url ? (
                  <Anchor href={r.settings_url} size="sm">
                    {r.entity_name}
                  </Anchor>
                ) : r.entity_name ? (
                  <Text component="span">{r.entity_name}</Text>
                ) : (
                  <Text c="text-secondary" component="span">
                    {t`(orphaned)`}
                  </Text>
                )}
              </td>
              <td style={cellStyle}>
                {r.cron ? (
                  <Text size="xs">
                    {getScheduleExplanation(r.cron) ?? r.cron}
                  </Text>
                ) : (
                  "—"
                )}
              </td>
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
