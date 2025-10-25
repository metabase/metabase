import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group } from "metabase/ui";
import {
  useCreateTransformJobMutation,
  useLazyGetTransformJobQuery,
} from "metabase-enterprise/api";

import type { TransformJobInfo } from "../../../types";

type SaveSectionProps = {
  job: TransformJobInfo;
};

export function SaveSection({ job: jobInfo }: SaveSectionProps) {
  const [createJob, { isLoading: isCreating }] =
    useCreateTransformJobMutation();
  const [fetchJob, { isFetching }] = useLazyGetTransformJobQuery();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleCreate = async () => {
    const { data: job, error } = await createJob(jobInfo);

    if (error) {
      sendErrorToast(t`Failed to create a job`);
    } else if (job != null) {
      // prefetch the job to avoid the loader on the job details page
      await fetchJob(job.id);
      sendSuccessToast(t`New job created`);
      dispatch(push(Urls.transformJob(job.id)));
    }
  };

  return (
    <Group>
      <Button component={Link} to={Urls.transformJobList()}>
        {t`Cancel`}
      </Button>
      <Button
        variant="filled"
        disabled={isCreating || isFetching}
        onClick={handleCreate}
      >
        {t`Save`}
      </Button>
    </Group>
  );
}
