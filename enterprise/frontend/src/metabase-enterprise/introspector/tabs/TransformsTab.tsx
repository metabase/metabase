import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useDeleteTransformMutation,
  useDeleteTransformTargetMutation,
} from "metabase/api";
import { Box, Button, Chip, Group, Stack, Text, TextInput } from "metabase/ui";

import { useListIntrospectorTransformsQuery } from "../api";
import { Pagination } from "../components/Pagination";
import { PendingDeletes } from "../components/PendingDeletes";
import { TransformsTable } from "../components/TransformsTable";
import type { PendingDelete } from "../hooks/usePendingDeletes";
import { usePendingDeletes } from "../hooks/usePendingDeletes";
import type {
  IntrospectorRow,
  TransformsFlagFilter,
} from "../types";

/** v1 suppress state — keyed per browser + admin. v2 promotes this to an app-DB table. */
const SUPPRESS_STORAGE_KEY = "metabase.introspector.suppressed-transforms";

/** Page size for server-side pagination (matches the Cards/Dashboards tabs). */
const PAGE_SIZE = 50;

interface SuppressEntry {
  id: number;
  acknowledged_at: string;
}

function readSuppressed(): SuppressEntry[] {
  try {
    const raw = window.localStorage.getItem(SUPPRESS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSuppressed(entries: SuppressEntry[]) {
  try {
    window.localStorage.setItem(SUPPRESS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage may be unavailable (private browsing); silently skip.
  }
}

function flagToConditions(flag: TransformsFlagFilter): string | undefined {
  switch (flag) {
    case "broken":
      return "broken";
    case "stale":
      return "unreferenced";
    case "all":
    default:
      return undefined;
  }
}

export function TransformsTab() {
  const [flag, setFlag] = useState<TransformsFlagFilter>("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [alsoDropTable, setAlsoDropTable] = useState(false);
  const [suppressed, setSuppressed] = useState<SuppressEntry[]>([]);
  const [showSuppressed, setShowSuppressed] = useState(false);

  useEffect(() => {
    setSuppressed(readSuppressed());
  }, []);

  const params = useMemo(
    () => ({
      conditions: flagToConditions(flag),
      search: search || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [flag, search, offset],
  );

  const { data, isFetching } = useListIntrospectorTransformsQuery(params);
  const allRows = useMemo(() => data?.rows ?? [], [data?.rows]);

  const suppressedIds = useMemo(
    () => new Set(suppressed.map((e) => e.id)),
    [suppressed],
  );

  const [deleteTransform, { isLoading: isTrashing }] =
    useDeleteTransformMutation();
  const [deleteTransformTarget, { isLoading: isDroppingTable }] =
    useDeleteTransformTargetMutation();

  // Actually fire the backend DELETE for a row whose grace period elapsed
  // (or for `Delete now`). Optionally drops the target table first, ignoring
  // failures so a missing/perm-denied table doesn't block the transform delete.
  const commitDelete = useCallback(
    async (entry: PendingDelete) => {
      if (entry.alsoDropTable && entry.target_table?.active) {
        try {
          await deleteTransformTarget(entry.id).unwrap();
        } catch {
          // fall through — proceed with the transform delete regardless.
        }
      }
      await deleteTransform(entry.id);
    },
    [deleteTransform, deleteTransformTarget],
  );

  const { pending, pendingIds, stage, restore, restoreAll, commitNow } =
    usePendingDeletes({ commitDelete });

  const isWorking = isTrashing || isDroppingTable;

  // Hide suppressed + currently-staged-for-delete rows from the visible list.
  const rows = useMemo(() => {
    const hidden = new Set<number>(pendingIds);
    if (!showSuppressed) {
      suppressedIds.forEach((id) => hidden.add(id));
    }
    if (hidden.size === 0) {
      return allRows;
    }
    return allRows.filter((r) => !hidden.has(r.id));
  }, [allRows, pendingIds, suppressedIds, showSuppressed]);

  // Reset to page 1 whenever filter/search changes (matches Cards/Dashboards tabs).
  const onFlagChange = useCallback((v: TransformsFlagFilter | null) => {
    setFlag(v ?? "all");
    setSelectedIds(new Set());
    setOffset(0);
  }, []);

  const onSearchChange = useCallback((v: string) => {
    setSearch(v);
    setOffset(0);
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }, [rows]);

  // Per-row trash icon: stage immediately into the Recently deleted panel.
  const trashOne = useCallback(
    (row: IntrospectorRow) => {
      stage(row, { alsoDropTable });
      setSelectedIds((prev) => {
        if (!prev.has(row.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    },
    [stage, alsoDropTable],
  );

  const trashSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    for (const id of ids) {
      const row = byId.get(id);
      if (row) {
        stage(row, { alsoDropTable });
      }
    }
    setSelectedIds(new Set());
  }, [selectedIds, rows, stage, alsoDropTable]);

  const suppressOne = useCallback((row: IntrospectorRow) => {
    setSuppressed((prev) => {
      const next = prev.some((e) => e.id === row.id)
        ? prev
        : [...prev, { id: row.id, acknowledged_at: new Date().toISOString() }];
      writeSuppressed(next);
      return next;
    });
  }, []);

  // Bulk suppress: dismiss every selected row at once. Same per-row semantics
  // as the menu Suppress action.
  const suppressSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    setSuppressed((prev) => {
      const known = new Set(prev.map((e) => e.id));
      const now = new Date().toISOString();
      const additions = ids
        .filter((id) => !known.has(id))
        .map((id) => ({ id, acknowledged_at: now }));
      if (additions.length === 0) {
        return prev;
      }
      const next = [...prev, ...additions];
      writeSuppressed(next);
      return next;
    });
    setSelectedIds(new Set());
  }, [selectedIds]);

  const clearSuppressed = useCallback(() => {
    writeSuppressed([]);
    setSuppressed([]);
  }, []);

  const total = data?.total ?? 0;
  const suppressedCount = suppressed.length;
  const selectedCount = selectedIds.size;

  return (
    <Stack gap="md">
      {/* ── Filter pills + search row ─────────────────────────────────────── */}
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Chip.Group
          value={flag}
          onChange={(v) => onFlagChange((v as TransformsFlagFilter) ?? null)}
        >
          <Group gap="xs">
            <Chip value="all" variant="outline">
              {t`All flagged`}
            </Chip>
            <Chip value="broken" variant="outline">
              {t`Broken`}
            </Chip>
            <Chip value="stale" variant="outline">
              {t`Stale`}
            </Chip>
          </Group>
        </Chip.Group>
        <TextInput
          placeholder={t`Search name…`}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          style={{ minWidth: 240, flex: "0 1 320px" }}
        />
      </Group>

      {/* ── Toolbar: page summary + bulk-action cluster ────────────────────── */}
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text c="text-secondary" size="sm">
          {isFetching
            ? t`Loading…`
            : showSuppressed
              ? t`${rows.length} of ${total} transforms (showing suppressed)`
              : t`${rows.length} of ${total} transforms${suppressedCount > 0 ? t` · ${suppressedCount} suppressed` : ""}`}
        </Text>
        <Group gap="xs">
          {suppressedCount > 0 && (
            <>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => setShowSuppressed((v) => !v)}
              >
                {showSuppressed
                  ? t`Hide suppressed`
                  : t`Show suppressed (${suppressedCount})`}
              </Button>
              {showSuppressed && (
                <Button
                  size="xs"
                  variant="subtle"
                  color="error"
                  onClick={clearSuppressed}
                >
                  {t`Clear suppressed`}
                </Button>
              )}
            </>
          )}
          <Text size="sm" c="text-secondary">
            {selectedCount > 0 ? t`${selectedCount} selected` : t`0 selected`}
          </Text>
          <Button
            size="xs"
            variant="default"
            disabled={selectedCount === 0}
            onClick={suppressSelected}
          >
            {t`Suppress selected`}
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => setAlsoDropTable((v) => !v)}
            color={alsoDropTable ? "error" : undefined}
            aria-pressed={alsoDropTable}
          >
            {alsoDropTable ? t`✓ Drop target tables` : t`Drop target tables`}
          </Button>
          <Button
            size="xs"
            color="error"
            disabled={selectedCount === 0 || isWorking}
            loading={isWorking}
            onClick={trashSelected}
          >
            {t`Delete selected…`}
          </Button>
        </Group>
      </Group>

      <Box>
        <TransformsTable
          rows={rows}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          isAllSelected={rows.length > 0 && selectedIds.size === rows.length}
          isLoading={isFetching}
          onTrash={trashOne}
          onSuppress={suppressOne}
        />
      </Box>

      <Pagination
        total={total}
        offset={offset}
        limit={PAGE_SIZE}
        onChange={setOffset}
      />

      <PendingDeletes
        pending={pending}
        onRestore={restore}
        onDeleteNow={(id) => void commitNow(id)}
        onRestoreAll={restoreAll}
      />
    </Stack>
  );
}
