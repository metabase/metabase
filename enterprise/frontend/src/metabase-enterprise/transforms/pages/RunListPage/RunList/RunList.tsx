import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useDispatch } from "metabase/lib/redux";
import { Card, Group, Stack } from "metabase/ui";
import type { TransformExecution } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { RunStatusInfo } from "../../../components/RunStatusInfo";
import type { RunListParams } from "../../../types";
import { getRunListUrl, getTransformUrl } from "../../../urls";
import { formatTrigger, parseLocalTimestamp } from "../../../utils";
import { PAGE_SIZE } from "../constants";

import S from "./RunList.module.css";

type RunListProps = {
  executions: TransformExecution[];
  totalCount: number;
  params: RunListParams;
};

export function RunList({ executions, totalCount, params }: RunListProps) {
  const { page = 0 } = params;
  const hasPagination = totalCount > PAGE_SIZE;

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
            itemCount={executions.length}
            totalCount={totalCount}
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
            <td>{parseLocalTimestamp(execution.start_time).format("lll")}</td>
            <td>
              {execution.end_time
                ? parseLocalTimestamp(execution.end_time).format("lll")
                : null}
            </td>
            <td>
              <RunStatusInfo
                status={execution.status}
                message={execution.message}
                endTime={
                  execution.end_time != null
                    ? parseLocalTimestamp(execution.end_time).toDate()
                    : null
                }
              />
            </td>
            <td>{formatTrigger(execution.trigger)}</td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}

type RunTablePaginationControlsProps = {
  page: number;
  itemCount: number;
  totalCount: number;
  params: RunListParams;
};

function RunTablePaginationControls({
  page,
  itemCount,
  totalCount,
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
      itemsLength={itemCount}
      total={totalCount}
      showTotal
      onPreviousPage={handlePreviousPage}
      onNextPage={handleNextPage}
    />
  );
}
