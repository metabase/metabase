import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useListTransformJobTransformsQuery,
  useUpdateTransformJobMutation,
} from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { TransformJobId } from "metabase-types/api";

import {
  canEditTransform,
  useTransformPermissions,
} from "./use-transform-permissions";

export function useJobHeaderState(jobId: TransformJobId | undefined) {
  const [updateJob] = useUpdateTransformJobMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const { transformsDatabases } = useTransformPermissions();
  const { data: transforms, isLoading: isCheckingPermissions } =
    useListTransformJobTransformsQuery(jobId ?? skipToken);

  const readOnly = useMemo(() => {
    if (!transformsDatabases || !transforms) {
      return true;
    }
    return !transforms.every((transform) =>
      canEditTransform(transform, transformsDatabases),
    );
  }, [transforms, transformsDatabases]);

  const handleNameChange = async (name: string) => {
    if (jobId == null) {
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
