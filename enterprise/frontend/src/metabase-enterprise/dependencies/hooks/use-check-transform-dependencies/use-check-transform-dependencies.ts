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
  const [patch, setPatch] = useState<UpdateTransformRequest | null>(null);
  const [isConfirmationShown, setIsConfirmationShown] = useState(false);
  const [checkTransform, { data }] = useLazyCheckTransformDependenciesQuery();

  const handleInitialSave = useCallback(
    async (patch: UpdateTransformRequest) => {
      if (patch.source == null) {
        await onSave(patch);
        return;
      }

      const data = await checkTransform({
        id: patch.id,
        source: patch.source,
      }).unwrap();
      if (data != null && !data.success) {
        setPatch(patch);
        setIsConfirmationShown(true);
      } else {
        setPatch(null);
        setIsConfirmationShown(false);
        await onSave(patch);
      }
    },
    [checkTransform, onSave],
  );

  const handleSaveAfterConfirmation = useCallback(async () => {
    if (patch != null) {
      await onSave(patch);
    }
  }, [patch, onSave]);

  const handleCancelSave = useCallback(() => {
    setPatch(null);
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
