import { useEffect, useRef } from "react";

import type { SdkComponentName } from "./component-events";

/**
 * A signal emitted by an SDK component when it reaches a terminal state
 * (ready with content drawn, or errored).
 *
 * Only the first signal per SDK load matters. The orchestrator in
 * `sdk-ready-event.ts` subscribes via `onFirstSignal` and sends one
 * `embedding_sdk_ready` event.
 */
export interface ComponentSignal {
  /** The component that finished. Absent for wrapper-level errors and timeouts. */
  component?: SdkComponentName;
  status: "ready" | "error";
  errorType?: string;
  timestamp: number;
}

type SignalCallback = (signal: ComponentSignal) => void;

/**
 * Module-level singleton store. No React context needed.
 *
 * The store accepts the first ready-or-error signal from any SDK component
 * and ignores every subsequent one. A subscriber attached before or after
 * the first signal fires exactly once.
 */
let firstSignal: ComponentSignal | null = null;
let listeners: SignalCallback[] = [];

function emit(signal: ComponentSignal): void {
  if (firstSignal !== null) {
    return;
  }
  firstSignal = signal;

  for (const callback of listeners) {
    callback(signal);
  }

  // All subscribers have been notified; future subscribers are handled
  // synchronously inside `onFirstSignal`.
  listeners = [];
}

/** Emit a "ready" signal for the given component. Only the first signal is kept. */
export function reportComponentReady(component: SdkComponentName): void {
  emit({
    component,
    status: "ready",
    timestamp: performance.now(),
  });
}

/** Emit an "error" signal for the given component. Only the first signal is kept. */
export function reportComponentError(
  component: SdkComponentName | undefined,
  errorType: string,
): void {
  emit({
    component,
    status: "error",
    errorType,
    timestamp: performance.now(),
  });
}

/**
 * Subscribe to the first signal. If a signal has already been recorded the
 * callback fires synchronously. Returns an unsubscribe function.
 */
export function onFirstSignal(callback: SignalCallback): () => void {
  if (firstSignal !== null) {
    callback(firstSignal);
    return () => {};
  }

  listeners.push(callback);

  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

/** Read the first recorded signal, or `null` if none yet. */
export function getFirstSignal(): ComponentSignal | null {
  return firstSignal;
}

/** @internal Test seam — resets all state so each test starts clean. */
export function resetComponentSignals(): void {
  firstSignal = null;
  listeners = [];
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

interface UseReportComponentReadyOptions {
  component?: SdkComponentName;
  /** `true` when content is drawn and the component is ready. */
  isReady: boolean;
  /** `true` when the component has reached an unrecoverable error state. */
  isError?: boolean;
  /** One of the error-type constants (auth_error, load_error, ...). */
  errorType?: string;
}

/**
 * Reports a single ready-or-error signal for the given component.
 *
 * The hook fires at most once per component mount: the first time either
 * `isReady` or `isError` becomes `true`.
 */
export function useReportComponentReady({
  component,
  isReady,
  isError = false,
  errorType,
}: UseReportComponentReadyOptions): void {
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) {
      return;
    }

    if (isError && errorType) {
      hasFired.current = true;
      reportComponentError(component, errorType);
      return;
    }

    if (isReady && component) {
      hasFired.current = true;
      reportComponentReady(component);
    }
  }, [component, isReady, isError, errorType]);
}
