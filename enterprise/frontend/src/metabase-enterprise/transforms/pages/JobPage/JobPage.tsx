import { useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useGetTransformJobQuery,
  useUpdateTransformJobMutation,
} from "metabase-enterprise/api";
import type {
  TransformJob,
  TransformJobId,
  TransformTagId,
} from "metabase-types/api";

import { JobView } from "../../components/JobView";
import { POLLING_INTERVAL } from "../../constants";

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
      sendSuccessToast(t`Job name updated`, async () => {
        const { error } = await updateJob({
          id: job.id,
          name: job.name,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleDescriptionChange = async (description: string | null) => {
    const { error } = await updateJob({
      id: job.id,
      description,
    });

    if (error) {
      sendErrorToast(t`Failed to update job description`);
    } else {
      sendSuccessToast(t`Job description updated`, async () => {
        const { error } = await updateJob({
          id: job.id,
          description: job.description,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleScheduleChange = async (schedule: string) => {
    const { error } = await updateJob({
      id: job.id,
      schedule,
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
    <JobView
      job={job}
      onNameChange={handleNameChange}
      onDescriptionChange={handleDescriptionChange}
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

function isPollingNeeded(job?: TransformJob) {
  return job?.last_run?.status === "started";
}
