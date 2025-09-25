import type { Location } from "history";
import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Stack, Title } from "metabase/ui";
import {
  useListTransformRunsQuery,
  useListTransformTagsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import { POLLING_INTERVAL } from "metabase-enterprise/transforms/constants";
import type { TransformRun } from "metabase-types/api";

import type { RunListParams } from "../../types";

import { RunFilterList } from "./RunFilterList";
import { RunList } from "./RunList";
import { PAGE_SIZE } from "./constants";
import { getParsedParams } from "./utils";

type RunListPageProps = {
  location: Location;
};

export function RunListPage({ location }: RunListPageProps) {
  const params = getParsedParams(location);

  return (
    <div>
      <Title order={1} mb="sm">{t`Runs`}</Title>
      <Box mb="xl">{t`A list of when each transform ran.`}</Box>
      <RunListPageBody params={params} />
    </div>
  );
}

type RunListPageBodyProps = {
  params: RunListParams;
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
      pollingInterval: POLLING_INTERVAL,
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
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const shouldPoll = isPollingNeeded(data.data);
  if (shouldPoll !== isPolling) {
    setIsPolling(shouldPoll);
  }
  return (
    <Stack data-testid="run-list-page">
      <RunFilterList transforms={transforms} tags={tags} params={params} />
      <RunList runs={data.data} totalCount={data.total} params={params} />
    </Stack>
  );
}

export function isPollingNeeded(transformRuns?: TransformRun[]) {
  return transformRuns?.some((run) => run.status === "started") ?? false;
}
