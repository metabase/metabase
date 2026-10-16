import {
  DATA_APP_DIAGNOSTICS_CALL_LIMIT,
  DATA_APP_DIAGNOSTICS_LIMIT,
  DATA_APP_DIAGNOSTIC_MAX_CHARS,
} from "../constants/diagnostics-channel";

/**
 * Trim to `DATA_APP_DIAGNOSTICS_LIMIT`, dropping requests first and never
 * letting them hold more than their own budget. Whatever they leave unused goes
 * to the other kinds, so a quiet app still keeps a full buffer of errors.
 * Insertion order is preserved.
 */
export const trimDiagnosticEntries = <T extends { kind: string }>(
  entries: T[],
): T[] => {
  if (entries.length <= DATA_APP_DIAGNOSTICS_LIMIT) {
    return entries;
  }

  const calls = entries
    .filter((entry) => entry.kind === "sdk-call")
    .slice(-DATA_APP_DIAGNOSTICS_CALL_LIMIT);
  const rest = entries
    .filter((entry) => entry.kind !== "sdk-call")
    .slice(-(DATA_APP_DIAGNOSTICS_LIMIT - calls.length));
  const kept = new Set<T>([...calls, ...rest]);

  return entries.filter((entry) => kept.has(entry));
};

export const truncateDiagnosticText = (
  value: string,
  max: number = DATA_APP_DIAGNOSTIC_MAX_CHARS,
): string =>
  value.length <= max
    ? value
    : `${value.slice(0, max)}… (truncated, ${value.length} chars)`;
