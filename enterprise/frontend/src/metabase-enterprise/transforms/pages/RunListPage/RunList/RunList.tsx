import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  Card,
  Group,
  Stack,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type { TransformRun, TransformTag } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { PAGE_SIZE } from "../constants";
import { hasFilterParams } from "../utils";

import { getColumns } from "./utils";

type RunListProps = {
  runs: TransformRun[];
  totalCount: number;
  params: Urls.TransformRunListParams;
  tags: TransformTag[];
};

export function RunList({ runs, totalCount, params, tags }: RunListProps) {
  const { page = 0 } = params;
  const dispatch = useDispatch();
  const systemTimezone = useSetting("system-timezone");

  const columns = useMemo(
    () => getColumns(tags, systemTimezone),
    [tags, systemTimezone],
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

  const treeTableInstance = useTreeTableInstance<TransformRun>({
    data: runs,
    columns,
    getNodeId: (run) => String(run.id),
    onRowActivate: handleRowActivate,
  });

  const handlePreviousPage = () => {
    dispatch(push(Urls.transformRunList({ ...params, page: page - 1 })));
  };

  const handleNextPage = () => {
    dispatch(push(Urls.transformRunList({ ...params, page: page + 1 })));
  };

  return (
    <Stack gap="lg" flex="0 1 auto" mih={0}>
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
      <Group justify="end">
        <PaginationControls
          page={page}
          pageSize={PAGE_SIZE}
          itemsLength={runs.length}
          total={totalCount}
          showTotal
          onPreviousPage={handlePreviousPage}
          onNextPage={handleNextPage}
        />
      </Group>
    </Stack>
  );
}
