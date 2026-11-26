// PROTOTYPE: remembers the playground's settings per person (local storage).
// Rename PREFIX per playground so two playgrounds never share keys.

const PREFIX = "metabase-chart-colors-playground";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The record saved under `key`, or `{}`. Values are unknown: narrow each one
 * before using it as a Leva initial value.
 */
export function readStoredRecord(key: string): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}:${key}`);
    const value: unknown = raw ? JSON.parse(raw) : undefined;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

export function writeStoredRecord(key: string, value: Record<string, unknown>) {
  try {
    window.localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // storage full or blocked: settings just won't survive a reload
  }
}

export function storedNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function storedString(
  value: unknown,
  allowed: readonly string[],
  fallback: string,
): string {
  return typeof value === "string" && allowed.includes(value)
    ? value
    : fallback;
}
