import type { Job, TaskScheduleFiring } from "metabase-types/api";

const NUM_HOURS = 24;
const NUM_DAYS = 7;

/** `cells[hour][day]` lists firings for that slot. */
export type HourlyCells = TaskScheduleFiring[][][];

export function maxPerDayFromCells(cells: HourlyCells): number[] {
  return Array.from({ length: NUM_DAYS }, (_, d) => {
    let max = 0;
    for (let h = 0; h < NUM_HOURS; h++) {
      const n = cells[h][d].length;
      if (n > max) {
        max = n;
      }
    }
    return max;
  });
}

/**
 * Linear heat within a day column: `count / dayMax` maps to brand mix percentage.
 * Returns undefined when the cell should have no heat fill.
 */
export function heatBrandMixPercent(
  count: number,
  dayMax: number,
  minPct = 6,
  maxPct = 48,
): number | undefined {
  if (count <= 0 || dayMax <= 0) {
    return undefined;
  }
  const intensity = Math.min(1, count / dayMax);
  return minPct + intensity * (maxPct - minPct);
}

export function heatCellBackground(
  count: number,
  dayMax: number,
): string | undefined {
  const pct = heatBrandMixPercent(count, dayMax);
  if (pct == null) {
    return undefined;
  }
  return `color-mix(in srgb, var(--mb-color-brand) ${pct}%, transparent)`;
}

export function uniqueJobKeyOptions(
  firings: TaskScheduleFiring[],
  jobs: Job[] | null | undefined,
): { value: string; label: string }[] {
  const keys = new Set<string>();
  for (const f of firings) {
    keys.add(f.job_key);
  }
  for (const j of jobs ?? []) {
    keys.add(j.key);
  }
  return [...keys].sort().map((k) => ({ value: k, label: k }));
}

export function filterFirings(
  firings: TaskScheduleFiring[],
  selectedJobKeys: string[],
  searchText: string,
): TaskScheduleFiring[] {
  const needle = searchText.trim().toLowerCase();
  return firings.filter((f) => {
    if (selectedJobKeys.length > 0 && !selectedJobKeys.includes(f.job_key)) {
      return false;
    }
    if (needle) {
      const hay = `${f.job_key} ${f.description ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) {
        return false;
      }
    }
    return true;
  });
}
