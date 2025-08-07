import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Stack } from "metabase/ui";
import { useGetTransformJobQuery } from "metabase-enterprise/api";
import type { TransformJobId } from "metabase-types/api";

import { BreadcrumbsSection } from "./BreadcrumbsSection";
import { ManageSection } from "./ManageSection";
import { NameSection } from "./NameSection";

type JobPageParams = {
  jobId: string;
};

type JobPageParsedParams = {
  jobId?: TransformJobId;
};

type JobPageProps = {
  params: JobPageParams;
};

export function JobPage({ params }: JobPageProps) {
  const { jobId } = getParsedParams(params);
  const {
    data: job,
    isLoading,
    error,
  } = useGetTransformJobQuery(jobId ?? skipToken);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (job == null) {
    return <LoadingAndErrorWrapper error={t`Not found.`} />;
  }

  return (
    <Stack gap="lg">
      <BreadcrumbsSection job={job} />
      <NameSection job={job} />
      <ManageSection job={job} />
    </Stack>
  );
}

export function getParsedParams({ jobId }: JobPageParams): JobPageParsedParams {
  return {
    jobId: Urls.extractEntityId(jobId),
  };
}
