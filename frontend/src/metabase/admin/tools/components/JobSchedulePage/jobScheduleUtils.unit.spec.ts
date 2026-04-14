import type { Job, TaskScheduleFiring } from "metabase-types/api";

import {
  filterFirings,
  heatBrandMixPercent,
  maxPerDayFromCells,
  uniqueJobKeyOptions,
} from "./jobScheduleUtils";

function emptyCells(): TaskScheduleFiring[][][] {
  return Array.from({ length: 24 }, () =>
    Array.from({ length: 7 }, () => [] as TaskScheduleFiring[]),
  );
}

describe("jobScheduleUtils", () => {
  describe("maxPerDayFromCells", () => {
    it("returns per-day max hour count", () => {
      const cells = emptyCells();
      cells[10][2].push({} as TaskScheduleFiring);
      cells[10][2].push({} as TaskScheduleFiring);
      cells[11][2].push({} as TaskScheduleFiring);
      cells[5][0].push({} as TaskScheduleFiring);
      const max = maxPerDayFromCells(cells);
      expect(max[0]).toBe(1);
      expect(max[2]).toBe(2);
      expect(max[1]).toBe(0);
    });
  });

  describe("heatBrandMixPercent", () => {
    it("scales intensity within a day so mid counts differ from peak", () => {
      const dayMax = 33;
      const low = heatBrandMixPercent(15, dayMax);
      const peak = heatBrandMixPercent(33, dayMax);
      expect(low).toBeDefined();
      expect(peak).toBeDefined();
      expect(peak!).toBeGreaterThan(low!);
    });

    it("returns undefined for empty cells or zero day max", () => {
      expect(heatBrandMixPercent(0, 10)).toBeUndefined();
      expect(heatBrandMixPercent(5, 0)).toBeUndefined();
    });
  });

  describe("filterFirings", () => {
    const a: TaskScheduleFiring = {
      at: "2025-01-01T00:00:00Z",
      job_key: "job.a",
      trigger_key: "t1",
      description: "Alpha task",
    };
    const b: TaskScheduleFiring = {
      at: "2025-01-01T01:00:00Z",
      job_key: "job.b",
      trigger_key: "t2",
    };

    it("filters by selected job keys", () => {
      expect(filterFirings([a, b], ["job.a"], "")).toEqual([a]);
    });

    it("filters by search substring on job key or description", () => {
      expect(filterFirings([a, b], [], "alpha")).toEqual([a]);
      expect(filterFirings([a, b], [], "job.b")).toEqual([b]);
    });

    it("applies job key and search together", () => {
      expect(filterFirings([a, b], ["job.a", "job.b"], "alpha")).toEqual([a]);
    });
  });

  describe("uniqueJobKeyOptions", () => {
    it("merges and sorts keys from firings and jobs", () => {
      const opts = uniqueJobKeyOptions(
        [
          {
            at: "x",
            job_key: "z.job",
            trigger_key: "t",
          },
          {
            at: "y",
            job_key: "a.job",
            trigger_key: "t",
          },
        ],
        [{ key: "m.job" } as Job],
      );
      expect(opts.map((o) => o.value)).toEqual(["a.job", "m.job", "z.job"]);
    });
  });
});
