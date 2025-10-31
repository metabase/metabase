import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { useLoadingTimer } from "metabase/common/hooks/use-loading-timer";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { useWebNotification } from "metabase/common/hooks/use-web-notification";
import { DASHBOARD_SLOW_TIMEOUT } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/lib/redux";
import { addUndo, dismissUndo } from "metabase/redux/undo";

export const useSlowCardNotification = () => {
  const { dashboard, isRunning, isLoadingComplete } = useDashboardContext();

  const dispatch = useDispatch();

  const { requestPermission, showNotification } = useWebNotification();

  const slowToastId = useUniqueId();

  useEffect(() => {
    if (isLoadingComplete) {
      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        showNotification(
          t`All Set! ${dashboard?.name} is ready.`,
          t`All questions loaded`,
        );
      }
    }

    return () => {
      dispatch(dismissUndo({ undoId: slowToastId }));
    };
  }, [
    dashboard?.name,
    dispatch,
    isLoadingComplete,
    showNotification,
    slowToastId,
  ]);

  const onConfirmToast = useCallback(async () => {
    await requestPermission();
    dispatch(dismissUndo({ undoId: slowToastId }));
  }, [dispatch, requestPermission, slowToastId]);

  const onTimeout = useCallback(() => {
    if ("Notification" in window && Notification.permission === "default") {
      dispatch(
        addUndo({
          id: slowToastId,
          timeout: false,
          message: t`Want to get notified when this dashboard loads?`,
          action: onConfirmToast,
          actionLabel: t`Notify me`,
        }),
      );
    }
  }, [dispatch, onConfirmToast, slowToastId]);

  useLoadingTimer(isRunning, {
    timer: DASHBOARD_SLOW_TIMEOUT,
    onTimeout,
  });
};
