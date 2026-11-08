/**
 * Module-level phase timestamp recorder for SDK loading lifecycle.
 *
 * Each phase is recorded once (first write wins) as a `performance.now()`
 * value. The orchestrator in `sdk-ready-event.ts` reads the phases and
 * converts them to offsets from `script_start` before sending.
 */

export type PhaseName =
  | "init_start"
  | "init_ready"
  | "component_start"
  | "metadata_ready"
  | "query_start"
  | "query_end"
  | "result_rendered";

const phases: Partial<Record<PhaseName, number>> = {};

/** Record a phase timestamp. Only the first call for each phase is kept. */
export function recordPhase(name: PhaseName): void {
  if (phases[name] === undefined) {
    phases[name] = performance.now();
  }
}

/**
 * Returns all recorded phases as integer offsets from `scriptStartMs`.
 *
 * `scriptStartMs` is the Resource Timing `startTime` of the SDK bundle
 * script tag, on the same time base as `performance.now()`.
 */
export function getPhaseOffsets(
  scriptStartMs: number,
): Record<string, number> | null {
  // Only PhaseName keys are ever written to `phases`.
  const keys = Object.keys(phases) as PhaseName[];

  if (keys.length === 0) {
    return null;
  }

  const result: Record<string, number> = {};

  for (const key of keys) {
    const value = phases[key];

    if (value !== undefined) {
      result[key] = Math.round(value - scriptStartMs);
    }
  }

  return result;
}

/** @internal Test seam — resets all recorded phases. */
export function resetPhaseTimestamps(): void {
  // Only PhaseName keys are ever written to `phases`.
  for (const key of Object.keys(phases) as PhaseName[]) {
    delete phases[key];
  }
}
