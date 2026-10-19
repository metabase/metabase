import { useEffect } from "react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getSdkPackageVersion } from "embedding-sdk-shared/lib/get-build-info";
import { METAPLOW_WEBSITE_ID } from "metabase/utils/metaplow";

import { useIsTrackingEnabled } from "./component-events";
import type { ComponentSignal } from "./component-signals";
import { onFirstSignal } from "./component-signals";
import {
  getSdkAuthMethod,
  getSdkClient,
  trackSdkSimpleEvent,
} from "./snowplow";
import { getSdkBundleStartTime } from "./start-time";

/** Maximum time (ms) to wait for a component signal before sending a timeout event. */
export const SDK_READY_TIMEOUT_MS = 45_000;

const METAPLOW_PROXY_PATH = "/api/metaplow-proxy/send";

let eventSent = false;

// ---------------------------------------------------------------------------
// Normal path — sends through the Snowplow tracker + Metaplow Track library
// ---------------------------------------------------------------------------

/** Send the ready/error event through the Snowplow tracker + Metaplow Track library. */
export function sendSdkReadyEvent(signal: ComponentSignal): void {
  if (eventSent) {
    return;
  }
  eventSent = true;

  const startTime = getSdkBundleStartTime();
  const durationMs =
    startTime != null
      ? Math.round(signal.timestamp - startTime.startTimeMs)
      : null;

  trackSdkSimpleEvent({
    event: "embedding_sdk_ready",
    result: signal.status === "ready" ? "ready" : "error",
    duration_ms: durationMs,
    event_detail: JSON.stringify({
      component: signal.component,
      error_type: signal.errorType,
      sdk_version: getSdkPackageVersion(),
      auth_method: getSdkAuthMethod(),
      client: getSdkClient(),
    }),
  });
}

function sendSdkTimeoutEvent(): void {
  if (eventSent) {
    return;
  }
  eventSent = true;

  trackSdkSimpleEvent({
    event: "embedding_sdk_ready",
    result: "timeout",
    duration_ms: null,
    event_detail: JSON.stringify({
      sdk_version: getSdkPackageVersion(),
      auth_method: getSdkAuthMethod(),
      client: getSdkClient(),
    }),
  });
}

// ---------------------------------------------------------------------------
// Direct path — a single fetch to the Metaplow proxy without the Track
// library. Used when auth fails or the timeout fires before settings load.
// The proxy returns 503 when tracking is off, so the opt-out holds.
// ---------------------------------------------------------------------------

function buildEventPayload(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: "event",
    payload: {
      website: METAPLOW_WEBSITE_ID,
      name: "embedding_sdk_ready",
      data,
    },
  };
}

/** Send the ready/error event via a direct POST to the Metaplow proxy (no Track library). */
export function sendDirectSdkReadyEvent(
  instanceUrl: string,
  signal: ComponentSignal,
): void {
  if (eventSent) {
    return;
  }
  eventSent = true;

  const startTime = getSdkBundleStartTime();
  const durationMs =
    startTime != null
      ? Math.round(signal.timestamp - startTime.startTimeMs)
      : null;

  const data: Record<string, unknown> = {
    result: signal.status === "ready" ? "ready" : "error",
    duration_ms: durationMs,
    event_detail: JSON.stringify({
      component: signal.component,
      error_type: signal.errorType,
      sdk_version: getSdkPackageVersion(),
      auth_method: getSdkAuthMethod(),
      client: getSdkClient(),
    }),
  };

  postToMetaplowProxy(instanceUrl, buildEventPayload(data));
}

// eslint-disable-next-line no-unused-vars -- wired when the Metaplow proxy endpoint lands
function sendDirectSdkTimeoutEvent(instanceUrl: string): void {
  if (eventSent) {
    return;
  }
  eventSent = true;

  const data: Record<string, unknown> = {
    result: "timeout",
    duration_ms: null,
    event_detail: JSON.stringify({
      sdk_version: getSdkPackageVersion(),
      auth_method: getSdkAuthMethod(),
      client: getSdkClient(),
    }),
  };

  postToMetaplowProxy(instanceUrl, buildEventPayload(data));
}

function postToMetaplowProxy(
  instanceUrl: string,
  body: Record<string, unknown>,
): void {
  const url = `${instanceUrl}${METAPLOW_PROXY_PATH}`;

  // Fire and forget. The proxy returns 503 when tracking is off.
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
    keepalive: true,
  }).catch(() => {
    // Silently ignore — the event is best-effort.
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribes to the first component ready/error signal and sends one
 * `embedding_sdk_ready` event per JS load via the Snowplow tracker.
 *
 * The hook waits for the tracker to become ready before sending. If a
 * component signals before the tracker initializes, the signal is buffered
 * and sent once the tracker is available.
 *
 * The direct-POST fallback (sendDirectSdkReadyEvent) is not wired here
 * yet — it will be enabled when the Metaplow proxy endpoint lands.
 *
 * Must be called inside a ComponentProvider subtree.
 */
export function useInitSdkReadyEvent(_instanceUrl: string): void {
  const isTrackingEnabled = useIsTrackingEnabled();
  const isTrackerReady = useSdkSelector((state) => state.sdk.sdkTrackerReady);
  const canSend = isTrackingEnabled && isTrackerReady;

  // Both the timeout and the signal subscription run through the Snowplow
  // tracker, so they share a single effect gated on the tracker being ready.
  // If a component signals before the tracker initializes, the signal is
  // buffered and `onFirstSignal` fires it synchronously once this effect runs.
  useEffect(() => {
    if (!canSend || eventSent) {
      return;
    }

    const startTime = getSdkBundleStartTime();
    const elapsed =
      startTime != null ? performance.now() - startTime.startTimeMs : 0;
    const remaining = Math.max(0, SDK_READY_TIMEOUT_MS - elapsed);
    const timerId = window.setTimeout(sendSdkTimeoutEvent, remaining);

    const unsubscribe = onFirstSignal(sendSdkReadyEvent);

    return () => {
      clearTimeout(timerId);
      unsubscribe();
    };
  }, [canSend]);
}

/** @internal Test seam — resets the sent guard so each test starts clean. */
export function resetSdkReadyEvent(): void {
  eventSent = false;
}
