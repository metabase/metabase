import type { Location } from "history";
import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type * as Urls from "metabase/lib/urls";
import { Box, Center, Stack } from "metabase/ui";
import {
  useListTransformRunsQuery,
  useListTransformTagsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import { TransformsSectionHeader } from "metabase-enterprise/data-studio/app/pages/TransformsSectionLayout/TransformsSectionHeader";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs/DataStudioBreadcrumbs";
import { POLLING_INTERVAL } from "metabase-enterprise/transforms/constants";
import type { TransformRun } from "metabase-types/api";

import { RunFilterList } from "./RunFilterList";
import { RunList } from "./RunList";
import S from "./RunListPage.module.css";
import { PAGE_SIZE } from "./constants";
import { getParsedParams } from "./utils";

type RunListPageProps = {
  location: Location;
};

export function RunListPage({ location }: RunListPageProps) {
  const params = getParsedParams(location);

  return (
    <Stack className={S.body} bg="bg-light" h="100%" gap={0}>
      <TransformsSectionHeader
        leftSection={<DataStudioBreadcrumbs>{t`Runs`}</DataStudioBreadcrumbs>}
      />
      <Stack p="lg" pt={0} h="100%">
        <Box>{t`A list of when each transform ran.`}</Box>
        <RunListPageBody params={params} />
      </Stack>
    </Stack>
  );
}

type RunListPageBodyProps = {
  params: Urls.TransformRunListParams;
};

function RunListPageBody({ params }: RunListPageBodyProps) {
  const {
    page = 0,
    statuses,
    transformIds,
    transformTagIds,
    startTime,
    endTime,
    runMethods,
  } = params;

  const [isPolling, setIsPolling] = useState(false);

  const {
    data,
    isLoading: isLoadingRuns,
    error: runsError,
  } = useListTransformRunsQuery(
    {
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      statuses,
      transform_ids: transformIds,
      transform_tag_ids: transformTagIds,
      start_time: startTime,
      end_time: endTime,
      run_methods: runMethods,
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

  if (!data || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Stack data-testid="run-list-page">
      <RunFilterList params={params} transforms={transforms} tags={tags} />
      <RunList
        runs={data.data}
        totalCount={data.total}
        params={params}
        tags={tags}
      />
    </Stack>
  );
}

export function isPollingNeeded(runs: TransformRun[] = []) {
  return runs.some(
    (run) => run.status === "started" || run.status === "canceling",
  );
}
