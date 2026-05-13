import { useCallback, useMemo, useState } from "react";
import { c, t } from "ttag";

import {
  useArchiveTransformMutation,
  useDeleteTransformTargetMutation,
} from "metabase/api";
import {
  Box,
  Chip,
  Group,
  Icon,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import {
  type DateFilter,
  dateFilterOptions,
  getDateFilterValue,
  isDateFilter,
} from "metabase-enterprise/clean_up/CleanupCollectionModal/utils";

import { useListIntrospectorTransformsQuery } from "../api";
import { BulkActionBar } from "../components/BulkActionBar";
import { Pagination } from "../components/Pagination";
import { TransformsTable } from "../components/TransformsTable";
import type { IntrospectorRow, TransformsFlagFilter } from "../types";

/** Page size for server-side pagination (matches the Cards/Dashboards tabs). */
const PAGE_SIZE = 50;

// Now that transforms have a real time-based stale signal (see
// `transform-stale-cte` in queries.clj), the "Stale" pill maps to the
// backend's actual stale condition rather than aliasing to unreferenced.
function flagToConditions(flag: TransformsFlagFilter): string | undefined {
  switch (flag) {
    case "broken":
      return "broken";
    case "stale":
      return "stale";
    case "unreferenced":
      return "unreferenced";
    case "all":
    default:
      return undefined;
  }
}

interface TransformsTabProps {
  /**
   * Staleness threshold lifted to `IntrospectorPage` so all three entity
   * tabs (Cards/Dashboards/Transforms) share the same cutoff and the
   * StatStrip totals stay in sync with whatever's on screen.
   */
  staleFilter: DateFilter;
  onStaleFilterChange: (next: DateFilter) => void;
}

export function TransformsTab({
  staleFilter,
  onStaleFilterChange,
}: TransformsTabProps) {
  const [flag, setFlag] = useState<TransformsFlagFilter>("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [alsoDropTable, setAlsoDropTable] = useState(false);

  const params = useMemo(
    () => ({
      conditions: flagToConditions(flag),
      search: search || undefined,
      // Same yyyy-MM-dd cutoff Cards/Dashboards pass — the backend matches
      // against `transform.created_at` for transforms.
      "stale-before": getDateFilterValue(staleFilter),
      limit: PAGE_SIZE,
      offset,
    }),
    [flag, search, staleFilter, offset],
  );

  const { data, isFetching } = useListIntrospectorTransformsQuery(params);
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);

  const [archiveTransform, { isLoading: isTrashing }] =
    useArchiveTransformMutation();
  const [deleteTransformTarget, { isLoading: isDroppingTable }] =
    useDeleteTransformTargetMutation();
  const isWorking = isTrashing || isDroppingTable;

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

  // Cancel deselects everything and resets the modifier toggle so the next
  // selection starts clean.
  const clearSelection = useCallback(() => {
    if (isWorking) {
      return;
    }
    setSelectedIds(new Set());
    setAlsoDropTable(false);
  }, [isWorking]);

  // Per-row trash: fire archive immediately for a single row. Doesn't
  // honor the bulk "Also drop target tables" toggle — that's a bulk-only
  // affordance and we don't want a single row-icon click silently doing
  // more than the user expected.
  const trashOne = useCallback(
    (row: IntrospectorRow) => {
      void archiveTransform(row.id);
      setSelectedIds((prev) => {
        if (!prev.has(row.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    },
    [archiveTransform],
  );

  // Optionally drop the target table before archiving — matches the spike's
  // "Also drop target tables" toggle. Failures on the table drop don't block
  // the archive call (best effort).
  const trashSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    await Promise.all(
      ids.map(async (id) => {
        const row = byId.get(id);
        if (!row) {
          return;
        }
        if (alsoDropTable && row.target_table?.active) {
          try {
            await deleteTransformTarget(row.id).unwrap();
          } catch {
            // proceed with archive regardless
          }
        }
        await archiveTransform(row.id);
      }),
    );
    setSelectedIds(new Set());
    setAlsoDropTable(false);
  }, [
    selectedIds,
    rows,
    alsoDropTable,
    archiveTransform,
    deleteTransformTarget,
  ]);

  const total = data?.total ?? 0;
  const selectedCount = selectedIds.size;

  return (
    <Stack gap="md">
      {/* ── Filter pills + staleness picker + search row ──────────────────── */}
      <Group wrap="wrap" gap="sm">
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
            <Chip value="unreferenced" variant="outline">
              {t`Unreferenced`}
            </Chip>
          </Group>
        </Chip.Group>
        {/*
          Staleness picker — matches FilterRow.tsx for Cards/Dashboards.
          For transforms the cutoff is matched against `transform.created_at`
          rather than `last_used_at` (see `transform-stale-cte` in queries.clj):
          a transform is stale when its target table is missing/inactive AND
          it has never run AND it was created before this cutoff.
        */}
        <Text
          size="sm"
          c={flag === "stale" ? "text-primary" : "text-secondary"}
          display="inline-flex"
          style={{ alignItems: "center" }}
        >
          {c("{0} is a duration (e.g.: 3 months)").jt`Not used in over ${(
            <Select
              key="stale-select"
              ml="xs"
              leftSection={<Icon name="calendar" />}
              data={dateFilterOptions}
              value={staleFilter}
              onChange={(next) => {
                if (next && isDateFilter(next)) {
                  onStaleFilterChange(next);
                  setOffset(0);
                }
              }}
              w={150}
              data-testid="introspector-stale-threshold"
            />
          )}`}
        </Text>
        {/* Search bar width matches Cards/Dashboards FilterRow exactly. */}
        <TextInput
          placeholder={t`Search name…`}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
      </Group>

      {/* ── Toolbar: page summary ─────────────────────────────────────────── */}
      <Text c="text-secondary" size="sm">
        {isFetching ? t`Loading…` : t`${rows.length} of ${total} transforms`}
      </Text>

      <Box>
        <TransformsTable
          rows={rows}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          isAllSelected={rows.length > 0 && selectedIds.size === rows.length}
          isLoading={isFetching}
          onTrash={trashOne}
        />
      </Box>

      <Pagination
        total={total}
        offset={offset}
        limit={PAGE_SIZE}
        onChange={setOffset}
      />

      {/*
        Floating bulk-action bar — same component Cards/Dashboards use,
        with an extra transforms-only `Also drop target tables` toggle.
        The bar is `position: sticky; bottom: 16px` so it floats at the
        bottom of the viewport once any row is selected; opaque dark
        background so it doesn't bleed the table behind it.
      */}
      <BulkActionBar
        count={selectedCount}
        onClear={clearSelection}
        onTrash={trashSelected}
        isWorking={isWorking}
        alsoDropTable={{
          checked: alsoDropTable,
          onToggle: setAlsoDropTable,
        }}
      />
    </Stack>
  );
}
