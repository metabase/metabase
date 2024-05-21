import { useState, useCallback } from "react";
import type { InjectedRouter, Route } from "react-router";
import { t } from "ttag";

import useBeforeUnload from "metabase/hooks/use-before-unload";
import { useConfirmation } from "metabase/hooks/use-confirmation";

import { useConfirmOnRouteLeave } from "./useConfirmOnRouteLeave";

export const useConfirmIfFormIsDirty = (
  /** If not specified, no confirmation will occur on route leave */
  router?: InjectedRouter,
  route?: Route,
) => {
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
    router,
    route,
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
