import type { Location } from "history";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Stack, Title } from "metabase/ui";
import {
  useListTransformRunsQuery,
  useListTransformTagsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";

import type { RunListParams } from "../../types";

import { FilterList } from "./FilterList";
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
  const { page = 0, statuses, transformIds, transformTagIds } = params;
  const {
    data,
    isLoading: isLoadingRuns,
    error: runsError,
  } = useListTransformRunsQuery({
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    statuses,
    transform_ids: transformIds,
    transform_tag_ids: transformTagIds,
  });
  const {
    data: transforms = [],
    isLoading: isLoadingTransforms,
    error: transformsError,
  } = useListTransformsQuery();
  const {
    data: tags = [],
    isLoading: isLoadingTags,
    error: tagsError,
  } = useListTransformTagsQuery();
  const isLoading = isLoadingRuns || isLoadingTransforms || isLoadingTags;
  const error = runsError ?? transformsError ?? tagsError;

  if (!data || isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Stack data-testid="transform-run-list-page">
      <FilterList transforms={transforms} tags={tags} params={params} />
      <RunList runs={data.data} totalCount={data.total} params={params} />
    </Stack>
  );
}
