import { useEffect, useRef, useState } from "react";

import type {
  PresenceModel,
  PresenceParameters,
  PresenceViewer,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks/use-setting";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";

const HEARTBEAT_INTERVAL_MS = 10_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 15_000;

/** Read the current URL's query string into a plain map. Repeated keys collapse to an array. */
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

function wsUrl(model: PresenceModel, modelId: number): string {
  const { protocol, host } = window.location;
  const wsProto = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${host}/api/presence-ws?model=${encodeURIComponent(
    model,
  )}&id=${modelId}`;
}

/**
 * Maintain a WebSocket connection to the presence service while the user is on
 * a question or dashboard page. Pauses while the tab is hidden, reconnects
 * with exponential backoff on disconnect. Returns the list of *other* users
 * currently viewing the same entity.
 *
 * The same hook used to short-poll over HTTP — Phase 3 moves it to a
 * server-pushed channel so avatar updates land in milliseconds rather than
 * waiting out a poll cycle.
 */
export function usePresence(
  model: PresenceModel,
  modelId: number | undefined,
): PresenceViewer[] {
  const currentUser = useSelector(getUser);
  const presenceEnabled = useSetting("presence-enabled");
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);

  const enabled =
    presenceEnabled !== false && currentUser != null && modelId != null;

  // Stable callback refs so we don't re-create the WS just because a parent
  // re-rendered with new function identities.
  const viewersRef = useRef(viewers);
  viewersRef.current = viewers;

  useEffect(() => {
    if (!enabled || modelId == null) {
      setViewers([]);
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let heartbeatId: ReturnType<typeof setInterval> | undefined;
    let reconnectId: ReturnType<typeof setTimeout> | undefined;
    let backoff = RECONNECT_BASE_DELAY_MS;

    const sendHeartbeat = () => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "heartbeat",
            parameters: readCurrentParameters(),
          }),
        );
      }
    };

    const clearHeartbeat = () => {
      if (heartbeatId != null) {
        clearInterval(heartbeatId);
        heartbeatId = undefined;
      }
    };

    const connect = () => {
      if (cancelled || document.hidden) {
        return;
      }
      try {
        ws = new WebSocket(wsUrl(model, modelId));
      } catch (e) {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        backoff = RECONNECT_BASE_DELAY_MS;
        sendHeartbeat();
        heartbeatId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && Array.isArray(msg.viewers)) {
            if (!cancelled) {
              setViewers(msg.viewers);
            }
          }
        } catch {
          // ignore non-JSON frames
        }
      };
      ws.onclose = () => {
        clearHeartbeat();
        ws = null;
        if (!cancelled && !document.hidden) {
          scheduleReconnect();
        }
      };
      ws.onerror = () => {
        // onclose will fire right after; reconnect happens there.
      };
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectId != null) {
        return;
      }
      const delay = backoff;
      backoff = Math.min(backoff * 2, RECONNECT_MAX_DELAY_MS);
      reconnectId = setTimeout(() => {
        reconnectId = undefined;
        connect();
      }, delay);
    };

    const close = () => {
      clearHeartbeat();
      if (ws != null) {
        try {
          ws.close(1000, "page-closed");
        } catch {}
        ws = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        close();
      } else if (ws == null) {
        backoff = RECONNECT_BASE_DELAY_MS;
        connect();
      }
    };

    if (!document.hidden) {
      connect();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (reconnectId != null) {
        clearTimeout(reconnectId);
      }
      close();
      document.removeEventListener("visibilitychange", handleVisibility);
      // Drop the viewer list locally so a stale stack doesn't survive a
      // navigation back to the same page.
      setViewers([]);
    };
  }, [enabled, model, modelId]);

  return viewers;
}
