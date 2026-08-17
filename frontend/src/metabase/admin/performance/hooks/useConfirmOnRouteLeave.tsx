import { useEffect, useRef } from "react";

import { useRouteLeaveBlocker } from "metabase/router";

type Props = {
  shouldConfirm: boolean;
  confirm: (onConfirm: () => void, onCancel: () => void) => void;
};

export const useConfirmOnRouteLeave = ({ shouldConfirm, confirm }: Props) => {
  const blocker = useRouteLeaveBlocker(() => shouldConfirm);

  // Both are replaced on every render or router state update. Read them through
  // refs so the effect below keys on the blocked state alone, and so asks once
  // per attempted navigation rather than again on every unrelated update.
  const latest = useRef({ blocker, confirm });
  latest.current = { blocker, confirm };

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }
    // The navigation is parked, so the URL never moved and there is nothing to
    // roll back: confirming resumes it, dismissing drops it.
    latest.current.confirm(
      () => latest.current.blocker.proceed?.(),
      () => latest.current.blocker.reset?.(),
    );
  }, [blocker.state]);
};
