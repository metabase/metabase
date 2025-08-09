import { useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Stack } from "metabase/ui";
import { useGetTransformJobQuery } from "metabase-enterprise/api";
import type { TransformJob, TransformJobId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../../constants";

import { HeaderSection } from "./HeaderSection";
import { ManageSection } from "./ManageSection";
import { NameSection } from "./NameSection";
import { ScheduleSection } from "./ScheduleSection";
import { TagSection } from "./TagSection";

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
  const [isPolling, setIsPolling] = useState(false);
  const {
    data: job,
    isLoading,
    error,
  } = useGetTransformJobQuery(jobId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  if (isPolling !== isPollingNeeded(job)) {
    setIsPolling(!isPolling);
  }

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (job == null) {
    return <LoadingAndErrorWrapper error={t`Not found.`} />;
  }

  return (
    <Stack gap="3.5rem">
      <Stack gap="lg">
        <HeaderSection job={job} />
        <NameSection job={job} />
      </Stack>
      <ScheduleSection job={job} />
      <TagSection job={job} />
      <ManageSection job={job} />
    </Stack>
  );
}

export function getParsedParams({ jobId }: JobPageParams): JobPageParsedParams {
  return {
    jobId: Urls.extractEntityId(jobId),
  };
}

export function isPollingNeeded(job?: TransformJob) {
  return job?.last_execution?.status === "started";
}
