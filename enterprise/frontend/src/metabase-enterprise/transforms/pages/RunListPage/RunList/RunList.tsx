import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useDispatch } from "metabase/lib/redux";
import { Card, Group, Stack } from "metabase/ui";
import { useListTransformExecutionsQuery } from "metabase-enterprise/api";
import type { TransformExecution } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import type { RunListParams } from "../../../types";
import { getRunListUrl, getTransformUrl } from "../../../urls";
import { formatStatus, formatTimestamp, formatTrigger } from "../../../utils";

import S from "./RunList.module.css";

const PAGE_SIZE = 50;

type RunListProps = {
  params: RunListParams;
};

export function RunList({ params }: RunListProps) {
  const { page = 0, transformIds } = params;
  const { data, isLoading, error } = useListTransformExecutionsQuery({
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    transform_ids: transformIds,
  });
  if (!data || isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const { data: executions, total } = data;
  const hasPagination = total > PAGE_SIZE;
  if (executions.length === 0) {
    return <ListEmptyState label={t`No runs yet`} />;
  }

  return (
    <Stack gap="lg">
      <RunTable executions={executions} />
      {hasPagination && (
        <Group justify="end">
          <RunTablePaginationControls
            page={page}
            itemsLength={executions.length}
            total={total}
            params={params}
          />
        </Group>
      )}
    </Stack>
  );
}

type RunTableProps = {
  executions: TransformExecution[];
};

function RunTable({ executions }: RunTableProps) {
  const dispatch = useDispatch();

  const handleRowClick = (execution: TransformExecution) => {
    if (execution.transform) {
      dispatch(push(getTransformUrl(execution.transform.id)));
    }
  };

  return (
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable
        columnTitles={[
          t`Transform`,
          t`Started at`,
          t`End at`,
          t`Status`,
          t`Trigger`,
        ]}
      >
        {executions.map((execution) => (
          <tr
            key={execution.id}
            className={S.row}
            onClick={() => handleRowClick(execution)}
          >
            <td>{execution.transform?.name}</td>
            <td>{formatTimestamp(execution.start_time)}</td>
            <td>
              {execution.end_time ? formatTimestamp(execution.end_time) : null}
            </td>
            <td>{formatStatus(execution.status)}</td>
            <td>{formatTrigger(execution.trigger)}</td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}

type RunTablePaginationControlsProps = {
  page: number;
  itemsLength: number;
  total: number;
  params: RunListParams;
};

function RunTablePaginationControls({
  page,
  itemsLength,
  total,
  params,
}: RunTablePaginationControlsProps) {
  const dispatch = useDispatch();

  const handlePreviousPage = () => {
    dispatch(push(getRunListUrl({ ...params, page: page - 1 })));
  };

  const handleNextPage = () => {
    dispatch(push(getRunListUrl({ ...params, page: page + 1 })));
  };

  return (
    <PaginationControls
      page={page}
      pageSize={PAGE_SIZE}
      itemsLength={itemsLength}
      total={total}
      showTotal
      onPreviousPage={handlePreviousPage}
      onNextPage={handleNextPage}
    />
  );
}
