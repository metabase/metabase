import { useEffect, useRef, useState } from "react";

import {
  type PresenceModel,
  type PresenceViewer,
  useLeavePresenceMutation,
  usePingPresenceMutation,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks/use-setting";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";

const POLL_INTERVAL_MS = 5_000;

/**
 * Poll the presence endpoint while the user is on a question or dashboard page,
 * pausing while the tab is hidden. Returns the list of *other* users currently
 * viewing the same entity.
 *
 * POC: no instance-toggle UI, no per-user hide, no embedding gate beyond the
 * structural one (this hook is only mounted from the authenticated app shell).
 */
export function usePresence(
  model: PresenceModel,
  modelId: number | undefined,
): PresenceViewer[] {
  const currentUser = useSelector(getUser);
  const presenceEnabled = useSetting("presence-enabled");
  const [pingPresence] = usePingPresenceMutation();
  const [leavePresence] = useLeavePresenceMutation();
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);

  // Stable refs so we don't re-create the interval when callbacks change.
  const pingRef = useRef(pingPresence);
  const leaveRef = useRef(leavePresence);
  pingRef.current = pingPresence;
  leaveRef.current = leavePresence;

  const enabled =
    presenceEnabled !== false && currentUser != null && modelId != null;

  useEffect(() => {
    if (!enabled || modelId == null) {
      setViewers([]);
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      try {
        const result = await pingRef
          .current({ model, model_id: modelId })
          .unwrap();
        if (!cancelled) {
          setViewers(result.viewers ?? []);
        }
      } catch {
        // Swallow — presence is best-effort.
      }
    };

    const start = () => {
      if (intervalId != null) {
        return;
      }
      void tick();
      intervalId = setInterval(tick, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
      // Best-effort leave so the avatar disappears for others without waiting for TTL.
      void leaveRef.current({ model, model_id: modelId }).catch(() => {});
    };
  }, [enabled, model, modelId]);

  return viewers;
}
