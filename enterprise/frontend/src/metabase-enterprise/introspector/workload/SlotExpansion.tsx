import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import { getScheduleExplanation } from "metabase/utils/cron";

import { useSpreadWorkloadJobsMutation } from "./api";
import type { WorkloadJobType, WorkloadSlotRow } from "./types";

type Props = {
  slot: string | null;
  rows: WorkloadSlotRow[] | undefined;
  isLoading: boolean;
  timezone: string;
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

function typeLabel(type: WorkloadJobType): string {
  switch (type) {
    case "sync":
      return t`Database sync`;
    case "transform-job":
      return t`Transform run`;
    case "alert":
      return t`Alert`;
    case "dashboard-subscription":
      return t`Subscription`;
    case "persisted-refresh":
      return t`Model cache refresh`;
  }
}

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
  <th style={{ ...headerStyleBase, cursor: "pointer" }} onClick={onClick}>
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

function rowId(r: WorkloadSlotRow, i: number): string {
  return `${r.type}-${r.entity_id ?? "x"}-${r.fire_at}-${i}`;
}

function formatSlotTitle(slot: string, timezone: string): string {
  const date = new Date(`${slot}:00Z`);
  const datePart = date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
  const timePart = date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  return `${datePart} · ${timePart} ${timezone}`;
}

function groupByType(
  rows: WorkloadSlotRow[],
): { type: WorkloadJobType; count: number }[] {
  const m = new Map<WorkloadJobType, number>();
  for (const r of rows) {
    m.set(r.type, (m.get(r.type) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));
}

export function SlotExpansion({ slot, rows, isLoading, timezone }: Props) {
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("weight");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [spreadMut, { isLoading: isSpreading }] =
    useSpreadWorkloadJobsMutation();

  // Clear selection whenever the focused slot changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [slot]);

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

  const groups = useMemo(() => (rows ? groupByType(rows) : []), [rows]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "weight" ? "desc" : "asc");
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const allVisibleIds = useMemo(
    () => visibleRows.map((r, i) => rowId(r, i)),
    [visibleRows],
  );
  const allSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds.has(id));

  const toggleAllVisible = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  };

  const onSpread = async () => {
    if (!slot) {
      return;
    }
    const jobs = visibleRows
      .map((r, i) => ({ row: r, id: rowId(r, i) }))
      .filter(({ id }) => selectedIds.has(id))
      .map(({ row }) => ({ type: row.type, entity_id: row.entity_id }));
    try {
      await spreadMut({ slot, jobs }).unwrap();
      dispatch(
        addUndo({
          message: t`Spread ${jobs.length} jobs across this hour`,
          toastColor: "success",
        }),
      );
      setSelectedIds(new Set());
    } catch {
      dispatch(
        addUndo({
          message: t`Couldn't spread those jobs — please try again`,
          toastColor: "error",
        }),
      );
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
        <Stack gap={4}>
          <Title order={5}>{formatSlotTitle(slot, timezone)}</Title>
          <Group gap={6} wrap="wrap">
            {groups.map(({ type, count }) => (
              <Badge key={type} color={BADGE_COLOR[type]} variant="light">
                {typeLabel(type)} · {count}
              </Badge>
            ))}
          </Group>
        </Stack>
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
            <th style={{ ...headerStyleBase, width: 32 }}>
              <Checkbox
                checked={allSelected}
                onChange={toggleAllVisible}
                aria-label={t`Select all visible`}
              />
            </th>
            {sortableHeader(
              sortKey === "type",
              sortDir,
              () => toggleSort("type"),
              t`Type`,
            )}
            {sortableHeader(
              sortKey === "entity",
              sortDir,
              () => toggleSort("entity"),
              t`Entity`,
            )}
            {sortableHeader(
              sortKey === "cron",
              sortDir,
              () => toggleSort("cron"),
              t`Schedule`,
            )}
            {sortableHeader(
              sortKey === "weight",
              sortDir,
              () => toggleSort("weight"),
              t`Weight`,
            )}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r, i) => {
            const id = rowId(r, i);
            const isSelected = selectedIds.has(id);
            return (
              <tr
                key={id}
                style={
                  isSelected
                    ? { background: "var(--mb-color-bg-white)" }
                    : undefined
                }
              >
                <td style={cellStyle}>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleRow(id)}
                    aria-label={t`Select job`}
                  />
                </td>
                <td style={cellStyle}>
                  <Badge color={BADGE_COLOR[r.type]} variant="light">
                    {typeLabel(r.type)}
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
              </tr>
            );
          })}
        </tbody>
      </table>

      {selectedIds.size > 0 && (
        <Paper withBorder p="sm" mt="md" shadow="sm" pos="sticky" bottom={16}>
          <Group justify="space-between">
            <Text fw={500} size="sm">
              {t`${selectedIds.size} selected`}
            </Text>
            <Group gap="xs">
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setSelectedIds(new Set())}
                disabled={isSpreading}
              >
                {t`Cancel`}
              </Button>
              <Button
                variant="filled"
                color="brand"
                size="xs"
                onClick={onSpread}
                loading={isSpreading}
              >
                {t`Spread across this hour`}
              </Button>
            </Group>
          </Group>
        </Paper>
      )}
    </Box>
  );
}
