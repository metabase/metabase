import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useListTransformJobTransformsQuery,
  useUpdateTransformJobMutation,
} from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import type { TransformJobId } from "metabase-types/api";

export function useJobHeaderState(jobId: TransformJobId | undefined) {
  const [updateJob] = useUpdateTransformJobMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const { data: transforms, isLoading: isCheckingPermissions } =
    useListTransformJobTransformsQuery(jobId ?? skipToken);

  const readOnly = useMemo(() => {
    if (!transforms) {
      return true;
    }
    return transforms.some((transform) => transform.can_execute === false);
  }, [transforms]);

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
