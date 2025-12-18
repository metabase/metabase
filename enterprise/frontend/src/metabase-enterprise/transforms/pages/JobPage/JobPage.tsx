import { useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import {
  useGetTransformJobQuery,
  useUpdateTransformJobMutation,
} from "metabase-enterprise/api";
import type {
  ScheduleDisplayType,
  TransformJob,
  TransformJobId,
  TransformTagId,
} from "metabase-types/api";

import { JobEditor } from "../../components/JobEditor";
import { POLLING_INTERVAL } from "../../constants";

import { JobMoreMenu } from "./JobMoreMenu";

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
    setIsPolling(isPollingNeeded(job));
  }

  if (isLoading || error != null || job == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <JobPageBody job={job} />;
}

type JobPageBodyProps = {
  job: TransformJob;
};

function JobPageBody({ job }: JobPageBodyProps) {
  const [updateJob] = useUpdateTransformJobMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleNameChange = async (name: string) => {
    const { error } = await updateJob({
      id: job.id,
      name,
    });

    if (error) {
      sendErrorToast(t`Failed to update job name`);
    } else {
      sendSuccessToast(t`Job name updated`);
    }
  };

  const handleScheduleChange = async (
    schedule: string,
    uiDisplayType: ScheduleDisplayType,
  ) => {
    const { error } = await updateJob({
      id: job.id,
      schedule,
      ui_display_type: uiDisplayType,
    });

    if (error) {
      sendErrorToast(t`Failed to update job schedule`);
    } else {
      sendSuccessToast(t`Job schedule updated`, async () => {
        const { error } = await updateJob({
          id: job.id,
          schedule: job.schedule,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleTagListChange = async (tagIds: TransformTagId[]) => {
    const { error } = await updateJob({
      id: job.id,
      tag_ids: tagIds,
    });

    if (error) {
      sendErrorToast(t`Failed to update job tags`);
    } else {
      sendSuccessToast(t`Job tags updated`, async () => {
        const { error } = await updateJob({
          id: job.id,
          tag_ids: job.tag_ids,
        });
        sendUndoToast(error);
      });
    }
  };

  return (
    <JobEditor
      job={job}
      menu={<JobMoreMenu job={job} />}
      onNameChange={handleNameChange}
      onScheduleChange={handleScheduleChange}
      onTagListChange={handleTagListChange}
    />
  );
}

function getParsedParams({ jobId }: JobPageParams): JobPageParsedParams {
  return {
    jobId: Urls.extractEntityId(jobId),
  };
}

export function isPollingNeeded(job?: TransformJob) {
  return (
    job?.last_run?.status === "started" || job?.last_run?.status === "canceling"
  );
}
