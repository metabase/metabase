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
  Icon,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "metabase/ui";
import { getScheduleExplanation } from "metabase/utils/cron";

import { usePauseWorkloadJobsMutation } from "./api";
import type { WorkloadJobType, WorkloadSlotRow } from "./types";

type Props = {
  slot: string | null;
  rows: WorkloadSlotRow[] | undefined;
  isLoading: boolean;
  timezone: string;
  rangeFrom: string; // used for "all week" title when slot is null
  rangeTo: string;
};

type SortKey = "type" | "entity" | "fires" | "weight" | "updated";
type SortDir = "asc" | "desc";

type SlotGroup = {
  id: string;
  type: WorkloadJobType;
  entity_id: number | null;
  entity_name: string | null;
  updated_at: string | null;
  creator: string | null;
  cron: string | null;
  settings_url: string | null;
  fires: number;
  totalWeight: number;
};

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

function groupKey(r: WorkloadSlotRow): string {
  // Group same-entity-same-schedule fires together. Cron is part of the key so
  // an entity with two different triggers in the same hour stays distinct.
  return `${r.type}::${r.entity_id ?? "x"}::${r.cron ?? ""}`;
}

function groupRows(rows: WorkloadSlotRow[]): SlotGroup[] {
  const m = new Map<string, SlotGroup>();
  for (const r of rows) {
    const key = groupKey(r);
    const existing = m.get(key);
    if (existing) {
      existing.fires += 1;
      existing.totalWeight += r.weight;
    } else {
      m.set(key, {
        id: key,
        type: r.type,
        entity_id: r.entity_id,
        entity_name: r.entity_name,
        updated_at: r.updated_at,
        creator: r.creator,
        cron: r.cron,
        settings_url: r.settings_url,
        fires: 1,
        totalWeight: r.weight,
      });
    }
  }
  return [...m.values()];
}

function sortGroups(
  groups: SlotGroup[],
  key: SortKey,
  dir: SortDir,
): SlotGroup[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: SlotGroup, b: SlotGroup) => {
    switch (key) {
      case "type":
        return sign * a.type.localeCompare(b.type);
      case "entity":
        return sign * (a.entity_name ?? "").localeCompare(b.entity_name ?? "");
      case "fires":
        return sign * (a.fires - b.fires);
      case "weight":
        return sign * (a.totalWeight - b.totalWeight);
      case "updated":
        return sign * (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
    }
  };
  return [...groups].sort(cmp);
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

function formatUpdated(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function countsByType(
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

function formatRangeTitle(
  fromIso: string,
  toIso: string,
  timezone: string,
): string {
  const from = new Date(fromIso);
  // toIso is exclusive (midnight after the last day) — show an inclusive end label.
  const inclusiveEnd = new Date(new Date(toIso).getTime() - 24 * 3600 * 1000);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: timezone,
    });
  return t`All scheduled work · ${fmt(from)} – ${fmt(inclusiveEnd)} ${timezone}`;
}

export function SlotExpansion({
  slot,
  rows,
  isLoading,
  timezone,
  rangeFrom,
  rangeTo,
}: Props) {
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("weight");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [pauseMut, { isLoading: isPausing }] = usePauseWorkloadJobsMutation();

  useEffect(() => {
    setSelectedIds(new Set());
  }, [slot]);

  const allGroups = useMemo(() => (rows ? groupRows(rows) : []), [rows]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const explainCron = (cron: string | null) => {
      if (!cron) {
        return "";
      }
      return getScheduleExplanation(cron)?.toLowerCase() ?? cron.toLowerCase();
    };
    const filtered = q
      ? allGroups.filter(
          (g) =>
            (g.entity_name ?? "").toLowerCase().includes(q) ||
            explainCron(g.cron).includes(q) ||
            g.type.toLowerCase().includes(q),
        )
      : allGroups;
    return sortGroups(filtered, sortKey, sortDir);
  }, [allGroups, query, sortKey, sortDir]);

  const typeSummary = useMemo(() => (rows ? countsByType(rows) : []), [rows]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "weight" || key === "fires" ? "desc" : "asc");
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
    () => visibleGroups.map((g) => g.id),
    [visibleGroups],
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

  const pauseJobs = async (
    jobs: { type: WorkloadJobType; entity_id: number | null }[],
  ) => {
    if (jobs.length === 0) {
      return;
    }
    try {
      const result = await pauseMut({ jobs }).unwrap();
      const skipped = jobs.length - result.paused;
      const msg =
        skipped === 0
          ? t`Paused ${result.paused} jobs`
          : t`Paused ${result.paused} jobs · ${skipped} skipped (not supported yet)`;
      dispatch(addUndo({ message: msg, toastColor: "success" }));
      setSelectedIds(new Set());
    } catch {
      dispatch(
        addUndo({
          message: t`Couldn't pause those jobs — please try again`,
          toastColor: "error",
        }),
      );
    }
  };

  const onPauseSelected = () => {
    const jobs = visibleGroups
      .filter((g) => selectedIds.has(g.id))
      .map((g) => ({ type: g.type, entity_id: g.entity_id }));
    pauseJobs(jobs);
  };

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
          {slot
            ? t`Nothing scheduled in this hour.`
            : t`Nothing scheduled in this week.`}
        </Text>
      </Box>
    );
  }

  const title = slot
    ? formatSlotTitle(slot, timezone)
    : formatRangeTitle(rangeFrom, rangeTo, timezone);

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
          <Title order={5}>{title}</Title>
          <Group gap={6} wrap="wrap">
            {typeSummary.map(({ type, count }) => (
              <Badge key={type} color={BADGE_COLOR[type]} variant="light">
                {typeLabel(type)} · {count}
              </Badge>
            ))}
          </Group>
        </Stack>
        <Group gap="sm" align="center">
          <Text c="text-secondary" size="xs">
            {visibleGroups.length === allGroups.length
              ? t`${allGroups.length} entities · ${rows.length} fires`
              : t`${visibleGroups.length} of ${allGroups.length} entities`}
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
            <th style={headerStyleBase}>{t`Created by`}</th>
            {sortableHeader(
              sortKey === "updated",
              sortDir,
              () => toggleSort("updated"),
              t`Updated`,
            )}
            <th style={headerStyleBase}>{t`Schedule`}</th>
            {sortableHeader(
              sortKey === "fires",
              sortDir,
              () => toggleSort("fires"),
              t`Fires`,
            )}
            {sortableHeader(
              sortKey === "weight",
              sortDir,
              () => toggleSort("weight"),
              t`Weight`,
            )}
            <th style={{ ...headerStyleBase, width: 64 }} />
          </tr>
        </thead>
        <tbody>
          {visibleGroups.map((g) => {
            const isSelected = selectedIds.has(g.id);
            return (
              <tr
                key={g.id}
                style={
                  isSelected
                    ? { background: "var(--mb-color-bg-white)" }
                    : undefined
                }
              >
                <td style={cellStyle}>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleRow(g.id)}
                    aria-label={t`Select job`}
                  />
                </td>
                <td style={cellStyle}>
                  <Badge color={BADGE_COLOR[g.type]} variant="light">
                    {typeLabel(g.type)}
                  </Badge>
                </td>
                <td style={cellStyle}>
                  {g.entity_name && g.settings_url ? (
                    <Anchor href={g.settings_url} size="sm">
                      {g.entity_name}
                    </Anchor>
                  ) : g.entity_name ? (
                    <Text component="span">{g.entity_name}</Text>
                  ) : (
                    <Text c="text-secondary" component="span">
                      {t`(orphaned)`}
                    </Text>
                  )}
                </td>
                <td style={cellStyle}>
                  {g.creator ? (
                    <Text size="sm">{g.creator}</Text>
                  ) : (
                    <Text size="sm" c="text-secondary">
                      —
                    </Text>
                  )}
                </td>
                <td style={cellStyle}>
                  <Text size="sm" c="text-secondary">
                    {formatUpdated(g.updated_at)}
                  </Text>
                </td>
                <td style={cellStyle}>
                  {g.cron ? (
                    <Text size="xs">
                      {getScheduleExplanation(g.cron) ?? g.cron}
                    </Text>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={cellStyle}>
                  <Text
                    size="sm"
                    fw={g.fires > 1 ? 500 : 400}
                    c={g.fires > 1 ? undefined : "text-secondary"}
                  >
                    {t`${g.fires}×`}
                  </Text>
                </td>
                <td style={cellStyle}>{g.totalWeight}</td>
                <td style={cellStyle}>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Tooltip label={t`Pause this job`}>
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        color="error"
                        onClick={() =>
                          pauseJobs([{ type: g.type, entity_id: g.entity_id }])
                        }
                        disabled={isPausing || g.entity_id == null}
                        aria-label={t`Pause`}
                      >
                        <Icon name="pause" size={12} />
                      </Button>
                    </Tooltip>
                    {g.settings_url ? (
                      <Tooltip label={t`Reschedule on settings page`}>
                        <Button
                          component="a"
                          href={g.settings_url}
                          variant="subtle"
                          size="compact-xs"
                          aria-label={t`Reschedule`}
                        >
                          <Icon name="clock" size={12} />
                        </Button>
                      </Tooltip>
                    ) : null}
                  </Group>
                </td>
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
                disabled={isPausing}
              >
                {t`Cancel`}
              </Button>
              <Button
                variant="filled"
                color="error"
                size="xs"
                onClick={onPauseSelected}
                loading={isPausing}
                leftSection={<Icon name="pause" size={12} />}
              >
                {t`Pause selected`}
              </Button>
            </Group>
          </Group>
        </Paper>
      )}
    </Box>
  );
}
