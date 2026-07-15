import { useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetTransformJobQuery,
  useUpdateTransformJobMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useJobHeaderState } from "metabase/transforms/hooks/use-job-header-state";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  ScheduleDisplayType,
  TransformJob,
  TransformJobId,
  TransformTagId,
} from "metabase-types/api";

import { JobEditor } from "../../components/JobEditor";
import { JobMoreMenu } from "../../components/JobMoreMenu";
import { JobTabs } from "../../components/JobTabs";
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
    isLoading: isLoadingJob,
    error: jobError,
  } = useGetTransformJobQuery(jobId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  const { isLoadingDatabases, databasesError } = useTransformPermissions();
  const { readOnly, isCheckingPermissions, onNameChange } =
    useJobHeaderState(jobId);

  if (isPolling !== isPollingNeeded(job)) {
    setIsPolling(isPollingNeeded(job));
  }

  const isLoading = isLoadingJob || isLoadingDatabases;
  const error = jobError || databasesError;
  if (isLoading || error != null || job == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <JobPageBody
      job={job}
      readOnly={readOnly}
      isCheckingPermissions={isCheckingPermissions}
      onNameChange={onNameChange}
    />
  );
}

type JobPageBodyProps = {
  job: TransformJob;
  readOnly?: boolean;
  isCheckingPermissions?: boolean;
  onNameChange: (name: string) => void;
};

function JobPageBody({
  job,
  readOnly,
  isCheckingPermissions,
  onNameChange,
}: JobPageBodyProps) {
  const [updateJob] = useUpdateTransformJobMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

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
      menu={!readOnly && <JobMoreMenu job={job} />}
      tabs={<JobTabs jobId={job.id} />}
      readOnly={readOnly}
      isCheckingPermissions={isCheckingPermissions}
      showMetabotButton
      onNameChange={onNameChange}
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
