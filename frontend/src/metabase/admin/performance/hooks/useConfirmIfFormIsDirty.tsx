import { useCallback, useState } from "react";
import { t } from "ttag";

import { useBeforeUnload } from "metabase/common/hooks/use-before-unload";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";

import { useConfirmOnRouteLeave } from "./useConfirmOnRouteLeave";

export const useConfirmIfFormIsDirty = () => {
  const [isStrategyFormDirty, setIsStrategyFormDirty] = useState(false);

  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const askBeforeDiscardingChanges = useCallback(
    (onConfirm: () => void) =>
      askConfirmation({
        title: t`Discard your changes?`,
        message: t`Your changes haven’t been saved, so you’ll lose them if you navigate away.`,
        confirmButtonText: t`Discard`,
        onConfirm,
      }),
    [askConfirmation],
  );

  useConfirmOnRouteLeave({
    shouldConfirm: isStrategyFormDirty,
    confirm: askBeforeDiscardingChanges,
  });
  useBeforeUnload(isStrategyFormDirty);

  return {
    askBeforeDiscardingChanges,
    confirmationModal,
    isStrategyFormDirty,
    setIsStrategyFormDirty,
  };
};
