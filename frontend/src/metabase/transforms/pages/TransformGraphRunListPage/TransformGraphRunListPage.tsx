import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import type { Location } from "history";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useListTransformGraphRunsQuery,
  useListTransformsQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useDispatch } from "metabase/redux";
import { replace } from "metabase/router";
import { DetailedViewSwitch } from "metabase/transforms/components/DetailedViewSwitch";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import { Center, Flex, Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TransformGraphRun } from "metabase-types/api";

import { TransformGraphRunFilterBar } from "./TransformGraphRunFilterBar";
import S from "./TransformGraphRunListPage.module.css";
import { TransformGraphRunSidebar } from "./TransformGraphRunSidebar";
import { TransformGraphRunTable, getRowKey } from "./TransformGraphRunTable";
import { PAGE_SIZE } from "./constants";
import type {
  TransformGraphRunFilterOptions,
  TransformGraphRunSortOptions,
} from "./types";
import {
  getFilterOptions,
  getParsedParams,
  getSortOptions,
  hasFilterOptions,
} from "./utils";

const EMPTY_RUNS: TransformGraphRun[] = [];

type TransformGraphRunListPageProps = {
  location: Location;
};

export function TransformGraphRunListPage({
  location,
}: TransformGraphRunListPageProps) {
  const params = useMemo(() => getParsedParams(location), [location]);
  const filterOptions = useMemo(() => getFilterOptions(params), [params]);
  const { page = 0 } = params;
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedRun, setSelectedRun] = useState<TransformGraphRun>();
  const [isPolling, setIsPolling] = useState(false);
  const dispatch = useDispatch();

  const {
    data,
    isLoading: isLoadingRuns,
    error,
  } = useListTransformGraphRunsQuery(
    {
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      types: params.types,
      statuses: params.statuses,
      "transform-ids": params.transformIds,
      "start-time": params.startTime,
      "end-time": params.endTime,
      "run-methods": params.runMethods,
      "sort-column": params.sortColumn,
      "sort-direction": params.sortDirection,
    },
    {
      pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
    },
  );

  const { data: transforms = [], isLoading: isLoadingTransforms } =
    useListTransformsQuery({});

  const isLoading = isLoadingRuns || isLoadingTransforms;

  if (isPolling !== isPollingNeeded(data?.data)) {
    setIsPolling(isPollingNeeded(data?.data));
  }

  const runs = data?.data ?? EMPTY_RUNS;

  useEffect(() => {
    setSelectedRun((current) =>
      current == null
        ? current
        : // Do not close sidebar on its own if selected run goes to next page
          (runs.find((run) => getRowKey(run) === getRowKey(current)) ??
          current),
    );
  }, [runs]);

  const handleParamsChange = useCallback(
    (newParams: Urls.TransformGraphRunListParams) => {
      dispatch(replace(Urls.transformGraphRunList(newParams)));
    },
    [dispatch],
  );

  const handleFilterOptionsChange = useCallback(
    (filterOptions: TransformGraphRunFilterOptions) => {
      handleParamsChange({ ...params, ...filterOptions, page: undefined });
    },
    [params, handleParamsChange],
  );

  const handleSortOptionsChange = useCallback(
    (sortOptions: TransformGraphRunSortOptions | undefined) => {
      handleParamsChange({
        ...params,
        sortColumn: sortOptions?.column,
        sortDirection: sortOptions?.direction,
        page: undefined,
      });
    },
    [params, handleParamsChange],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      handleParamsChange({ ...params, page: nextPage });
    },
    [params, handleParamsChange],
  );

  const handleSelect = useCallback(
    (run: TransformGraphRun) => setSelectedRun(run),
    [],
  );

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
      data-testid="transform-graph-run-list"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap={0}>
        <PaneHeader
          breadcrumbs={<DataStudioBreadcrumbs>{t`Runs`}</DataStudioBreadcrumbs>}
          py={0}
          showMetabotButton
        />
        {isLoading || error != null ? (
          <Center h="100%">
            <LoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <Stack flex="0 1 auto" mih={0} gap="lg" pt="2.5rem">
            <Group justify="space-between" align="center" wrap="nowrap">
              <TransformGraphRunFilterBar
                filterOptions={filterOptions}
                transforms={transforms}
                onFilterOptionsChange={handleFilterOptionsChange}
              />
              <DetailedViewSwitch
                detailed={false}
                params={Urls.pickCommonRunListParams(params)}
              />
            </Group>
            <TransformGraphRunTable
              runs={runs}
              hasFilters={hasFilterOptions(filterOptions)}
              sortOptions={getSortOptions(params)}
              onSortOptionsChange={handleSortOptionsChange}
              onSelect={handleSelect}
            />
            {data != null && data.total > PAGE_SIZE && (
              <Group justify="end">
                <PaginationControls
                  page={page}
                  pageSize={PAGE_SIZE}
                  itemsLength={runs.length}
                  total={data.total}
                  showTotal
                  onPreviousPage={() => handlePageChange(page - 1)}
                  onNextPage={() => handlePageChange(page + 1)}
                />
              </Group>
            )}
          </Stack>
        )}
      </Stack>
      {selectedRun != null && (
        <TransformGraphRunSidebar
          run={selectedRun}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedRun(undefined)}
        />
      )}
    </Flex>
  );
}

export function isPollingNeeded(runs: TransformGraphRun[] = []) {
  return runs.some(
    (run) => run.status === "started" || run.status === "canceling",
  );
}
