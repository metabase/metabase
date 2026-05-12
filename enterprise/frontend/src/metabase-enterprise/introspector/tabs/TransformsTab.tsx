import { useMemo, useState } from "react";
import { t } from "ttag";

import { useDeleteTransformMutation } from "metabase/api";
import { Box } from "metabase/ui";

import { useListIntrospectorTransformsQuery } from "../api";
import { BulkActionBar } from "../components/BulkActionBar";
import { ContentTable } from "../components/ContentTable";
import { FilterRow } from "../components/FilterRow";
import type { IntrospectorCondition, IntrospectorRow } from "../types";

export function TransformsTab() {
  const [conditions, setConditions] = useState<Set<IntrospectorCondition>>(
    new Set(["broken", "unreferenced"]),
  );
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const params = useMemo(
    () => ({
      conditions: Array.from(conditions).join(","),
      search: search || undefined,
      limit: 50,
    }),
    [conditions, search],
  );

  const { data, isFetching } = useListIntrospectorTransformsQuery(params);
  const rows = data?.rows ?? [];

  const [deleteTransform, { isLoading: isTrashing }] =
    useDeleteTransformMutation();

  const toggleCondition = (c: IntrospectorCondition) => {
    const next = new Set(conditions);
    if (next.has(c)) {
      next.delete(c);
    } else {
      next.add(c);
    }
    setConditions(next);
    setSelectedIds(new Set());
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
    await deleteTransform(row.id);
    selectedIds.delete(row.id);
    setSelectedIds(new Set(selectedIds));
  };

  const trashSelected = async () => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => deleteTransform(id)));
    setSelectedIds(new Set());
  };

  return (
    <Box>
      <FilterRow
        conditions={conditions}
        onToggleCondition={toggleCondition}
        search={search}
        onSearchChange={setSearch}
        availableConditions={["broken", "unreferenced"]}
      />
      <ContentTable
        entityType="transforms"
        rows={rows}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        isAllSelected={rows.length > 0 && selectedIds.size === rows.length}
        isLoading={isFetching}
        onOpen={(row) => `/admin/transforms/${row.id}`}
        onOpenDeps={(row) =>
          `/data-studio/dependencies/graph?type=transform&id=${row.id}`
        }
        onTrash={trashOne}
      />
      <BulkActionBar
        count={selectedIds.size}
        onTrash={trashSelected}
        onClear={() => setSelectedIds(new Set())}
        isWorking={isTrashing}
      />
      {!isFetching && data && (
        <Box mt="sm" ta="right" c="text-secondary" fz="xs">
          {t`Showing ${rows.length} of ${data.total}`}
        </Box>
      )}
    </Box>
  );
}
