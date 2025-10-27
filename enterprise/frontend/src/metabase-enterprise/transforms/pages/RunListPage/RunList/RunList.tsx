import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Card, Flex, Group, Stack } from "metabase/ui";
import type { TransformRun, TransformTag } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { RunStatusInfo } from "../../../components/RunStatusInfo";
import { formatRunMethod, parseTimestampWithTimezone } from "../../../utils";
import { PAGE_SIZE } from "../constants";
import { hasFilterParams } from "../utils";

import S from "./RunList.module.css";
import { TagList } from "./TagList";
import { TimezoneIndicator } from "./TimezoneIndicator";

type RunListProps = {
  runs: TransformRun[];
  totalCount: number;
  params: Urls.TransformRunListParams;
  tags: TransformTag[];
};

export function RunList({ runs, totalCount, params, tags }: RunListProps) {
  const { page = 0 } = params;
  const hasPagination = totalCount > PAGE_SIZE;

  if (runs.length === 0) {
    const hasFilters = hasFilterParams(params);
    return (
      <ListEmptyState label={hasFilters ? t`No runs found` : t`No runs yet`} />
    );
  }

  return (
    <Stack gap="lg">
      <RunTable runs={runs} tags={tags} />
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
  tags: TransformTag[];
};

function RunTable({ runs, tags }: RunTableProps) {
  const systemTimezone = useSetting("system-timezone");
  const dispatch = useDispatch();

  const handleRowClick = (run: TransformRun) => {
    if (run.transform) {
      dispatch(push(Urls.transform(run.transform.id)));
    }
  };

  return (
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable
        columnTitles={[
          t`Transform`,
          <Flex key="started-at" align="center" gap="xs">
            <span className={S.nowrap}>{t`Started at`}</span>{" "}
            <TimezoneIndicator />
          </Flex>,
          <Flex key="end-at" align="center" gap="xs">
            <span className={S.nowrap}>{t`Ended at`}</span>{" "}
            <TimezoneIndicator />
          </Flex>,
          t`Status`,
          t`Trigger`,
          t`Tags`,
        ]}
      >
        {runs.map((run) => (
          <tr
            key={run.id}
            className={S.row}
            onClick={() => handleRowClick(run)}
          >
            <td className={S.wrap}>{run.transform?.name}</td>
            <td className={S.nowrap}>
              {parseTimestampWithTimezone(
                run.start_time,
                systemTimezone,
              ).format("lll")}
            </td>
            <td className={S.nowrap}>
              {run.end_time
                ? parseTimestampWithTimezone(
                    run.end_time,
                    systemTimezone,
                  ).format("lll")
                : null}
            </td>
            <td className={S.wrap}>
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
            <td className={S.wrap}>{formatRunMethod(run.run_method)}</td>
            <td className={S.wrap}>
              <TagList tags={tags} tagIds={run.transform?.tag_ids ?? []} />
            </td>
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
  params: Urls.TransformRunListParams;
};

function RunTablePaginationControls({
  page,
  itemCount,
  totalCount,
  params,
}: RunTablePaginationControlsProps) {
  const dispatch = useDispatch();

  const handlePreviousPage = () => {
    dispatch(push(Urls.transformRunList({ ...params, page: page - 1 })));
  };

  const handleNextPage = () => {
    dispatch(push(Urls.transformRunList({ ...params, page: page + 1 })));
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
