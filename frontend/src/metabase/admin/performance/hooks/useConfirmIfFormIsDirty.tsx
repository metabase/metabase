import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
} from "react";
import type { InjectedRouter, Route } from "react-router";
import { t } from "ttag";

import useBeforeUnload from "metabase/hooks/use-before-unload";
import { useConfirmation } from "metabase/hooks/use-confirmation";

import { useConfirmOnRouteLeave } from "./useConfirmOnRouteLeave";

/**
 * We want to show a confirmation modal before the user abandons changes in the
 * caching strategy form. This hook provides variables and functions related to
 * doing this */
export const useConfirmIfFormIsDirty = (
  /** If not specified, no confirmation will occur on route leave */
  router?: InjectedRouter,
  route?: Route,
): {
  askBeforeDiscardingChanges: (onConfirm: () => void) => void;
  confirmationModal: React.ReactNode;
  isStrategyFormDirty: boolean;
  setIsStrategyFormDirty: Dispatch<SetStateAction<boolean>>;
  /** If the strategy form is dirty, show the user a confirmation modal before
   * invoking the callback. Otherwise just invoke the callback */
  withConfirmation: (callback: () => void) => void;
} => {
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

  const withConfirmation = useCallback(
    (callback: () => void) => {
      if (isStrategyFormDirty) {
        askBeforeDiscardingChanges(callback);
      } else {
        callback();
      }
    },
    [askBeforeDiscardingChanges, isStrategyFormDirty],
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
    withConfirmation,
  };
};
