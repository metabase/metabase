import type { Location } from "history";
import { useCallback, useState } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Center, Stack } from "metabase/ui";
import {
  useListTransformRunsQuery,
  useListTransformTagsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { POLLING_INTERVAL } from "metabase-enterprise/transforms/constants";
import type { TransformRun } from "metabase-types/api";

import { RunFilterBar } from "./RunFilterBar";
import { RunPagination } from "./RunPagination";
import { RunTable } from "./RunTable";
import { PAGE_SIZE } from "./constants";
import type {
  TransformRunFilterOptions,
  TransformRunSortOptions,
} from "./types";
import {
  getFilterOptions,
  getParsedParams,
  getSortOptions,
  hasFilterOptions,
} from "./utils";

type RunListPageProps = {
  location: Location;
};

export function RunListPage({ location }: RunListPageProps) {
  const params = getParsedParams(location);

  return (
    <PageContainer data-testid="transforms-run-list" gap={0}>
      <PaneHeader
        breadcrumbs={<DataStudioBreadcrumbs>{t`Runs`}</DataStudioBreadcrumbs>}
        py={0}
        showMetabotButton
      />
      <RunListPageBody params={params} />
    </PageContainer>
  );
}

type RunListPageBodyProps = {
  params: Urls.TransformRunListParams;
};

function RunListPageBody({ params }: RunListPageBodyProps) {
  const { page = 0 } = params;
  const [isPolling, setIsPolling] = useState(false);
  const dispatch = useDispatch();

  const {
    data,
    isLoading: isLoadingRuns,
    error: runsError,
  } = useListTransformRunsQuery(
    {
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      statuses: params.statuses,
      transform_ids: params.transformIds,
      transform_tag_ids: params.transformTagIds,
      start_time: params.startTime,
      end_time: params.endTime,
      run_methods: params.runMethods,
      sort_column: params.sortColumn,
      sort_direction: params.sortDirection,
    },
    {
      pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
    },
  );

  const {
    data: transforms = [],
    isLoading: isLoadingTransforms,
    error: transformsError,
  } = useListTransformsQuery({});

  const {
    data: tags = [],
    isLoading: isLoadingTags,
    error: tagsError,
  } = useListTransformTagsQuery();

  const isLoading = isLoadingRuns || isLoadingTransforms || isLoadingTags;
  const error = runsError ?? transformsError ?? tagsError;

  if (isPolling !== isPollingNeeded(data?.data)) {
    setIsPolling(isPollingNeeded(data?.data));
  }

  const handleParamsChange = useCallback(
    (newParams: Urls.TransformRunListParams) => {
      dispatch(replace(Urls.transformRunList(newParams)));
    },
    [dispatch],
  );

  const handleFilterOptionsChange = useCallback(
    (filterOptions: TransformRunFilterOptions) => {
      handleParamsChange({ ...params, ...filterOptions, page: undefined });
    },
    [params, handleParamsChange],
  );

  const handleSortOptionsChange = useCallback(
    (sortOptions: TransformRunSortOptions | undefined) => {
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
    (page: number) => {
      handleParamsChange({ ...params, page });
    },
    [params, handleParamsChange],
  );

  if (!data || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Stack flex="0 1 auto" mih={0} gap="lg">
      <RunFilterBar
        filterOptions={getFilterOptions(params)}
        transforms={transforms}
        tags={tags}
        onFilterOptionsChange={handleFilterOptionsChange}
      />
      <RunTable
        runs={data.data}
        tags={tags}
        hasFilters={hasFilterOptions(getFilterOptions(params))}
        sortOptions={getSortOptions(params)}
        onSortOptionsChange={handleSortOptionsChange}
      />
      <RunPagination
        page={page}
        itemsLength={data.data.length}
        totalCount={data.total}
        onPageChange={handlePageChange}
      />
    </Stack>
  );
}

export function isPollingNeeded(runs: TransformRun[] = []) {
  return runs.some(
    (run) => run.status === "started" || run.status === "canceling",
  );
}
