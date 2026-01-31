import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { TransformRun, TransformTag } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { hasFilterParams } from "../utils";

import { getColumns, getSortingOptions, getSortingState } from "./utils";

type RunListProps = {
  runs: TransformRun[];
  params: Urls.TransformRunListParams;
  tags: TransformTag[];
  onParamsChange: (params: Urls.TransformRunListParams) => void;
};

export function RunList({ runs, params, tags, onParamsChange }: RunListProps) {
  const dispatch = useDispatch();
  const systemTimezone = useSetting("system-timezone");

  const columns = useMemo(
    () => getColumns(tags, systemTimezone),
    [tags, systemTimezone],
  );

  const sortingState = useMemo(
    () => getSortingState(params.sortColumn, params.sortDirection),
    [params.sortColumn, params.sortDirection],
  );

  const notFoundLabel = hasFilterParams(params)
    ? t`No runs found`
    : t`No runs yet`;

  const handleRowActivate = useCallback(
    (row: Row<TransformRun>) => {
      const run = row.original;
      if (run.transform && !run.transform.deleted) {
        dispatch(push(Urls.transform(run.transform.id)));
      }
    },
    [dispatch],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      const newSortingOptions = getSortingOptions(newSortingState);
      onParamsChange({
        ...params,
        sortColumn: newSortingOptions?.column,
        sortDirection: newSortingOptions?.direction,
        page: undefined,
      });
    },
    [sortingState, params, onParamsChange],
  );

  const treeTableInstance = useTreeTableInstance<TransformRun>({
    data: runs,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (run) => String(run.id),
    onRowActivate: handleRowActivate,
    onSortingChange: handleSortingChange,
  });

  return (
    <Card
      className={CS.overflowHidden}
      p={0}
      flex="0 1 auto"
      mih={0}
      shadow="none"
      withBorder
    >
      <TreeTable
        instance={treeTableInstance}
        emptyState={<ListEmptyState label={notFoundLabel} />}
        ariaLabel={t`Transform runs`}
        onRowClick={handleRowActivate}
      />
    </Card>
  );
}
