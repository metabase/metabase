import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Icon } from "metabase/ui";
import { useCreateTransformJobMutation } from "metabase-enterprise/api";

import { getJobUrl } from "../../../urls";

const DEFAULT_SCHEDULE = "0 0 * * * ? *";

export function NewJobButton() {
  const [createJob, { isLoading }] = useCreateTransformJobMutation();
  const { sendErrorToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleCreate = async () => {
    const { data: job, error } = await createJob({
      name: t`New job`,
      schedule: DEFAULT_SCHEDULE,
    });

    if (error) {
      sendErrorToast(t`Failed to create a job`);
    } else if (job != null) {
      dispatch(push(getJobUrl(job.id)));
    }
  };

  return (
    <Button
      variant="filled"
      leftSection={<Icon name="add" />}
      disabled={isLoading}
      onClick={handleCreate}
    >
      {isLoading ? t`Creating a job…` : t`Create a job`}
    </Button>
  );
}
