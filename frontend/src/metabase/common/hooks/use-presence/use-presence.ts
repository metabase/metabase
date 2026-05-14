import { useEffect, useRef, useState } from "react";

import {
  type PresenceModel,
  type PresenceParameters,
  type PresenceViewer,
  useLeavePresenceMutation,
  usePingPresenceMutation,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks/use-setting";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";

const POLL_INTERVAL_MS = 5_000;

/**
 * Read the current URL's query string into a plain map. Repeated keys (e.g.
 * `?cat=a&cat=b`) collapse to an array. Stable order is preserved as the
 * URLSearchParams iteration order.
 */
function readCurrentParameters(): PresenceParameters {
  if (typeof window === "undefined") {
    return {};
  }
  const params = new URLSearchParams(window.location.search);
  const out: PresenceParameters = {};
  for (const [key, value] of params.entries()) {
    const existing = out[key];
    if (existing == null) {
      out[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else if (typeof existing === "string") {
      out[key] = [existing, value];
    } else {
      out[key] = [String(existing), value];
    }
  }
  return out;
}

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
          .current({
            model,
            model_id: modelId,
            parameters: readCurrentParameters(),
          })
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
