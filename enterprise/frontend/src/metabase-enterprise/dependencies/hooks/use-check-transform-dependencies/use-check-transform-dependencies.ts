import { useCallback, useState } from "react";

import type {
  UseCheckTransformDependenciesProps,
  UseCheckTransformDependenciesResult,
} from "metabase/plugins";
import { useLazyCheckTransformDependenciesQuery } from "metabase-enterprise/api";
import type { UpdateTransformRequest } from "metabase-types/api";

export function useCheckTransformDependencies({
  onSave,
  onError,
}: UseCheckTransformDependenciesProps): UseCheckTransformDependenciesResult {
  const [request, setRequest] = useState<UpdateTransformRequest | null>(null);
  const [isConfirmationShown, setIsConfirmationShown] = useState(false);
  const [checkTransform, { data, isLoading }] =
    useLazyCheckTransformDependenciesQuery();

  const handleInitialSave = useCallback(
    async (request: UpdateTransformRequest) => {
      if (request.source == null) {
        await onSave(request);
        return;
      }

      const { data, error } = await checkTransform({
        id: request.id,
        source: request.source,
      });
      if (error != null) {
        onError(error);
      } else if (data != null && !data.success) {
        setRequest(request);
        setIsConfirmationShown(true);
      } else {
        await onSave(request);
      }
    },
    [checkTransform, onSave, onError],
  );

  const handleSaveAfterConfirmation = useCallback(async () => {
    if (request != null) {
      await onSave(request);
      setRequest(null);
      setIsConfirmationShown(false);
    }
  }, [request, onSave]);

  const handleCloseConfirmation = useCallback(() => {
    setRequest(null);
    setIsConfirmationShown(false);
  }, []);

  return {
    checkData: data,
    isCheckingDependencies: isLoading,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  };
}
