const hasPerformanceNow =
  typeof performance !== "undefined" && typeof performance.now === "function";

export function getPerfNow(): number {
  return hasPerformanceNow ? performance.now() : Date.now();
}

export function getIsoTimestamp(): string {
  return new Date().toISOString();
}

export function logPerfEvent(
  scope: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  console.log(`[embedding-sdk][${scope}] ${message}`, {
    timestamp: getIsoTimestamp(),
    ...details,
  });
}

export function logPerfDuration(
  scope: string,
  message: string,
  startTime: number,
  details: Record<string, unknown> = {},
) {
  const durationMs = Math.round(getPerfNow() - startTime);

  logPerfEvent(scope, message, { durationMs, ...details });
}


