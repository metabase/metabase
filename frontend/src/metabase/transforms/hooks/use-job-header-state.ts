import { t } from "ttag";

import {
  skipToken,
  useGetTransformJobQuery,
  useUpdateTransformJobMutation,
} from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import type { TransformJobId } from "metabase-types/api";

export function useJobHeaderState(jobId: TransformJobId | undefined) {
  const [updateJob] = useUpdateTransformJobMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const { data: job, isLoading: isCheckingPermissions } =
    useGetTransformJobQuery(jobId ?? skipToken);
  const readOnly = job != null && !job.can_execute;

  const handleNameChange = async (name: string) => {
    if (jobId === undefined) {
      return;
    }
    const { error } = await updateJob({ id: jobId, name });
    if (error) {
      sendErrorToast(t`Failed to update job name`);
    } else {
      sendSuccessToast(t`Job name updated`);
    }
  };

  return { readOnly, isCheckingPermissions, onNameChange: handleNameChange };
}
