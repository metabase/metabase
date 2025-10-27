import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useCreateTransformJobMutation,
  useLazyGetTransformJobQuery,
} from "metabase-enterprise/api";
import type { ScheduleDisplayType, TransformTagId } from "metabase-types/api";

import { JobEditor, type TransformJobInfo } from "../../components/JobEditor";

import { JobActions } from "./JobActions";

type NewJobPageProps = {
  route: Route;
};

export function NewJobPage({ route }: NewJobPageProps) {
  const initialJob = useMemo(() => getNewJobInfo(), []);
  const [job, setJob] = useState(initialJob);
  const isDirty = useMemo(() => !_.isEqual(job, initialJob), [job, initialJob]);
  const [createJob, { isLoading: isCreating }] =
    useCreateTransformJobMutation();
  const [fetchJob, { isFetching }] = useLazyGetTransformJobQuery();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const dispatch = useDispatch();
  const isSaving = isCreating || isFetching;

  const handleSave = async () => {
    const { data: newJob, error } = await createJob(job);

    if (error) {
      sendErrorToast(t`Failed to create a job`);
    } else if (newJob != null) {
      // prefetch the job to avoid the loader on the job details page
      await fetchJob(newJob.id);
      sendSuccessToast(t`New job created`);
      dispatch(push(Urls.transformJob(newJob.id)));
    }
  };

  const handleNameChange = (name: string) => {
    setJob({ ...job, name });
  };

  const handleScheduleChange = (
    schedule: string,
    uiDisplayType: ScheduleDisplayType,
  ) => {
    setJob({ ...job, schedule, ui_display_type: uiDisplayType });
  };

  const handleTagListChange = (tagIds: TransformTagId[]) => {
    setJob({ ...job, tag_ids: tagIds });
  };

  return (
    <>
      <JobEditor
        job={job}
        actions={<JobActions iSaving={isSaving} onSave={handleSave} />}
        onNameChange={handleNameChange}
        onScheduleChange={handleScheduleChange}
        onTagListChange={handleTagListChange}
      />
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </>
  );
}

function getNewJobInfo(): TransformJobInfo {
  return {
    name: t`New job`,
    description: null,
    schedule: "0 0 0 * * ? *",
    ui_display_type: "cron/builder",
    tag_ids: [],
  };
}
