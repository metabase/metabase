import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Card, Flex, Group, Stack } from "metabase/ui";
import { TimezoneIndicator } from "metabase-enterprise/transforms/components/TimezoneIndicator";
import type { TransformRun } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { RunStatusInfo } from "../../../components/RunStatusInfo";
import type { RunListParams } from "../../../types";
import { getRunListUrl, getTransformUrl } from "../../../urls";
import { formatRunMethod, parseTimestampWithTimezone } from "../../../utils";
import { PAGE_SIZE } from "../constants";

import S from "./RunList.module.css";

type RunListProps = {
  runs: TransformRun[];
  totalCount: number;
  params: RunListParams;
};

export function RunList({ runs, totalCount, params }: RunListProps) {
  const { page = 0 } = params;
  const hasPagination = totalCount > PAGE_SIZE;

  if (runs.length === 0) {
    return <ListEmptyState label={t`No runs yet`} />;
  }

  return (
    <Stack gap="lg">
      <RunTable runs={runs} />
      {hasPagination && (
        <Group justify="end">
          <RunTablePaginationControls
            page={page}
            itemCount={runs.length}
            totalCount={totalCount}
            params={params}
          />
        </Group>
      )}
    </Stack>
  );
}

type RunTableProps = {
  runs: TransformRun[];
};

function RunTable({ runs }: RunTableProps) {
  const systemTimezone = useSetting("system-timezone");
  const dispatch = useDispatch();

  const handleRowClick = (run: TransformRun) => {
    if (run.transform) {
      dispatch(push(getTransformUrl(run.transform.id)));
    }
  };

  return (
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable
        columnTitles={[
          t`Transform`,
          <Flex key="started-at" align="center" gap="xs">
            {t`Started at`} <TimezoneIndicator />
          </Flex>,
          <Flex key="end-at" align="center" gap="xs">
            {t`End at`} <TimezoneIndicator />
          </Flex>,
          t`Status`,
          t`Trigger`,
        ]}
      >
        {runs.map((run) => (
          <tr
            key={run.id}
            className={S.row}
            onClick={() => handleRowClick(run)}
          >
            <td className={S.cell}>{run.transform?.name}</td>
            <td className={S.cell}>
              {parseTimestampWithTimezone(
                run.start_time,
                systemTimezone,
              ).format("lll")}
            </td>
            <td className={S.cell}>
              {run.end_time
                ? parseTimestampWithTimezone(
                    run.end_time,
                    systemTimezone,
                  ).format("lll")
                : null}
            </td>
            <td className={S.cell}>
              <RunStatusInfo
                transform={run.transform}
                status={run.status}
                message={run.message}
                endTime={
                  run.end_time != null
                    ? parseTimestampWithTimezone(
                        run.end_time,
                        systemTimezone,
                      ).toDate()
                    : null
                }
              />
            </td>
            <td className={S.cell}>{formatRunMethod(run.run_method)}</td>
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
