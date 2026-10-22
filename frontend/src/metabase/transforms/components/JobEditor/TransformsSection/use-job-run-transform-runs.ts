import { useMemo, useState } from "react";

import { skipToken, useListJobRunTransformRunsQuery } from "metabase/api";
import { isActiveRunStatus } from "metabase/transforms/utils";
import type { TransformJobId, TransformRun } from "metabase-types/api";
import { PENDING_RUN_ID } from "metabase-types/api";

import { POLLING_INTERVAL } from "../../../constants";

import type { TransformRunByTransformId } from "./types";

export const useJobRunTransformRuns = (
  jobId: TransformJobId,
  lastJobRun?: TransformRun | null,
) => {
  const [isPolling, setIsPolling] = useState(false);
  const isJobRunPersisted = !!lastJobRun && lastJobRun.id !== PENDING_RUN_ID;
  const { data: transformRuns } = useListJobRunTransformRunsQuery(
    isJobRunPersisted ? { jobId, runId: lastJobRun.id } : skipToken,
    { pollingInterval: isPolling ? POLLING_INTERVAL : undefined },
  );

  const isJobRunActive = isActiveRunStatus(lastJobRun?.status);
  const isTransformRunActive =
    transformRuns?.some((run) => isActiveRunStatus(run.status)) ?? false;
  const shouldPoll =
    isJobRunPersisted && (isJobRunActive || isTransformRunActive);

  if (isPolling !== shouldPoll) {
    setIsPolling(shouldPoll);
  }

  return useMemo(() => {
    const transformRunByTransformId: TransformRunByTransformId = new Map();
    transformRuns?.forEach((transformRun) => {
      if (transformRun.transform_id !== null) {
        transformRunByTransformId.set(transformRun.transform_id, transformRun);
      }
    });
    return transformRunByTransformId;
  }, [transformRuns]);
};
