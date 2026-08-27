/**
 * Lightweight W3C Trace Context propagation for distributed tracing.
 *
 * Generates `traceparent` headers (https://www.w3.org/TR/trace-context/)
 * without requiring the full OpenTelemetry browser SDK.
 *
 * How it works:
 * - A new trace ID is generated for each "activity burst" — a group of
 *   API requests that happen close together (e.g., a dashboard load,
 *   a filter application, a query run).
 * - After a short idle period (no API calls), the next request starts
 *   a new trace. This naturally groups related requests together.
 * - Route changes always start a new trace immediately.
 * - Each individual API request gets a unique span ID (parent-id).
 * - The backend extracts the `traceparent` header and creates child spans.
 *
 * traceparent format: {version}-{trace-id}-{parent-id}-{trace-flags}
 *   version:     "00"
 *   trace-id:    32 hex chars (128-bit)
 *   parent-id:   16 hex chars (64-bit)
 *   trace-flags: "01" (sampled)
 */

let currentTraceId: string | null = null;
let enabled = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let traceExpired = false;

/** Idle time in ms before the current trace expires and the next request starts a new one. */
const IDLE_TIMEOUT_MS = 5000;

function generateHexId(byteLength: number): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function newTraceId(): void {
  currentTraceId = generateHexId(16); // 128-bit = 32 hex chars
  traceExpired = false;
}

function resetIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    traceExpired = true;
  }, IDLE_TIMEOUT_MS);
}

/**
 * Enable tracing and generate the first trace ID.
 * Called once at app startup when `tracing-enabled` is true.
 */
export function initTracing(): void {
  enabled = true;
  newTraceId();
}

/**
 * Force a new trace ID immediately. Called on route changes
 * so navigating between pages always starts a fresh trace.
 */
export function rotateTraceId(): void {
  if (enabled) {
    newTraceId();
  }
}

/**
 * Get a W3C `traceparent` header value for the current request.
 * Returns null when tracing is disabled.
 *
 * If the idle timeout has elapsed since the last API call, a new
 * trace ID is generated automatically — so each "burst" of related
 * requests (dashboard load, filter click, etc.) gets its own trace.
 *
 * Each call generates a unique span ID (parent-id) so every
 * API request is a distinct span within the shared trace.
 */
/** Reset all state. Exported only for tests. */
export function _resetForTesting(): void {
  currentTraceId = null;
  enabled = false;
  traceExpired = false;
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

export function getTraceparentHeader(): string | null {
  if (!enabled || !currentTraceId) {
    return null;
  }

  if (traceExpired) {
    newTraceId();
  }

  resetIdleTimer();

  const spanId = generateHexId(8); // 64-bit = 16 hex chars
  return `00-${currentTraceId}-${spanId}-01`;
}
