import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group } from "metabase/ui";
import {
  useCreateTransformJobMutation,
  useLazyGetTransformJobQuery,
} from "metabase-enterprise/api";

import { getJobListUrl, getJobUrl } from "../../../urls";
import type { TransformJobInfo } from "../types";

import S from "./SaveSection.module.css";

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
      dispatch(push(getJobUrl(job.id)));
    }
  };

  return (
    <Group className={S.section} pt="md">
      <Button
        variant="filled"
        disabled={isCreating || isFetching}
        onClick={handleCreate}
      >
        {t`Save`}
      </Button>
      <Button component={Link} to={getJobListUrl()}>{t`Cancel`}</Button>
    </Group>
  );
}
