import { useCallback, useState } from "react";

import type {
  UseCheckTransformDependenciesProps,
  UseCheckTransformDependenciesResult,
} from "metabase/plugins";
import { useLazyCheckTransformDependenciesQuery } from "metabase-enterprise/api";
import type { UpdateTransformRequest } from "metabase-types/api";

export function useCheckTransformDependencies({
  onSave,
}: UseCheckTransformDependenciesProps): UseCheckTransformDependenciesResult {
  const [request, setRequest] = useState<UpdateTransformRequest | null>(null);
  const [isConfirmationShown, setIsConfirmationShown] = useState(false);
  const [checkTransform, { data }] = useLazyCheckTransformDependenciesQuery();

  const handleInitialSave = useCallback(
    async (request: UpdateTransformRequest) => {
      if (request.source == null) {
        await onSave(request);
        return;
      }

      const data = await checkTransform({
        id: request.id,
        source: request.source,
      }).unwrap();
      if (data != null && !data.success) {
        setRequest(request);
        setIsConfirmationShown(true);
      } else {
        setRequest(null);
        setIsConfirmationShown(false);
        await onSave(request);
      }
    },
    [checkTransform, onSave],
  );

  const handleSaveAfterConfirmation = useCallback(async () => {
    if (request != null) {
      await onSave(request);
    }
  }, [request, onSave]);

  const handleCancelSave = useCallback(() => {
    setRequest(null);
    setIsConfirmationShown(false);
  }, []);

  return {
    checkData: data,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCancelSave,
  };
}
