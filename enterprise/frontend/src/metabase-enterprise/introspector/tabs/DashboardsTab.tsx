import { useMemo, useState } from "react";

import { useUpdateDashboardMutation } from "metabase/api";
import { Box } from "metabase/ui";
import {
  type DateFilter,
  getDateFilterValue,
} from "metabase-enterprise/clean_up/CleanupCollectionModal/utils";

import { useListIntrospectorDashboardsQuery } from "../api";
import { BulkActionBar } from "../components/BulkActionBar";
import { ContentTable } from "../components/ContentTable";
import { FilterRow } from "../components/FilterRow";
import { Pagination } from "../components/Pagination";
import type { IntrospectorCondition, IntrospectorRow } from "../types";

const PAGE_SIZE = 50;

interface DashboardsTabProps {
  /** See CardsTab — staleness is lifted to IntrospectorPage. */
  staleFilter: DateFilter;
  onStaleFilterChange: (next: DateFilter) => void;
}

export function DashboardsTab({
  staleFilter,
  onStaleFilterChange,
}: DashboardsTabProps) {
  const [conditions, setConditions] = useState<Set<IntrospectorCondition>>(
    new Set(["broken", "stale", "unreferenced"]),
  );
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const params = useMemo(
    () => ({
      conditions: Array.from(conditions).join(","),
      search: search || undefined,
      "stale-before": getDateFilterValue(staleFilter),
      limit: PAGE_SIZE,
      offset,
    }),
    [conditions, search, staleFilter, offset],
  );

  const { data, isFetching } = useListIntrospectorDashboardsQuery(params);
  const rows = data?.rows ?? [];

  const [updateDashboard, { isLoading: isTrashing }] =
    useUpdateDashboardMutation();

  const toggleCondition = (c: IntrospectorCondition) => {
    const next = new Set(conditions);
    if (next.has(c)) {
      next.delete(c);
    } else {
      next.add(c);
    }
    setConditions(next);
    setSelectedIds(new Set());
    setOffset(0);
  };

  const onSearchChange = (v: string) => {
    setSearch(v);
    setOffset(0);
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const trashOne = async (row: IntrospectorRow) => {
    await updateDashboard({ id: row.id, archived: true });
    setSelectedIds((prev) => {
      if (!prev.has(row.id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
  };

  const trashSelected = async () => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => updateDashboard({ id, archived: true })));
    setSelectedIds(new Set());
  };

  return (
    <Box>
      <FilterRow
        conditions={conditions}
        onToggleCondition={toggleCondition}
        search={search}
        onSearchChange={onSearchChange}
        staleness={{
          value: staleFilter,
          onChange: (next) => {
            onStaleFilterChange(next);
            setOffset(0);
          },
        }}
      />
      <ContentTable
        entityType="dashboards"
        rows={rows}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        isAllSelected={rows.length > 0 && selectedIds.size === rows.length}
        isLoading={isFetching}
        onOpen={(row) => `/dashboard/${row.id}`}
        onOpenDeps={(row) =>
          `/data-studio/dependencies/graph?type=dashboard&id=${row.id}`
        }
        onTrash={trashOne}
      />
      <Pagination
        total={data?.total ?? 0}
        offset={offset}
        limit={PAGE_SIZE}
        onChange={setOffset}
      />
      <BulkActionBar
        count={selectedIds.size}
        onTrash={trashSelected}
        onClear={() => setSelectedIds(new Set())}
        isWorking={isTrashing}
      />
    </Box>
  );
}
