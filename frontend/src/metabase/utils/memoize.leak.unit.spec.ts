import {
  formatRetentionProfile,
  profileCacheRetention,
  requireGarbageCollection,
  settleAndCollect,
} from "__support__/memory";
import { memoizeClass } from "metabase/utils/memoize";

const INSTANCES_PER_PASS = 2_000;
const CALLS_PER_INSTANCE = 20;

// 2,000 instances x 20 calls, so a cache that outlived its instance would show.
const RETENTION_BUDGET_MB = 1;

class Chart {
  series() {
    return { rows: [1, 2, 3] };
  }

  slice(index: number, options: { label: string }) {
    return { index, label: options.label, rows: [1, 2, 3] };
  }
}

const MemoizedChart = memoizeClass<Chart>("series", "slice")(Chart);

/** Builds instances, calls the memoized methods, then drops everything. */
function driveInstances(firstIndex: number) {
  for (let i = 0; i < INSTANCES_PER_PASS; i++) {
    const chart = new MemoizedChart();
    for (let call = 0; call < CALLS_PER_INSTANCE; call++) {
      chart.series();
      chart.slice(firstIndex + call, { label: `slice ${call}` });
    }
  }
}

function makeResultRef(): WeakRef<object> {
  const chart = new MemoizedChart();
  return new WeakRef(chart.series());
}

describe("memoizeClass", () => {
  it("returns the identical result for one instance", () => {
    const chart = new MemoizedChart();

    expect(chart.series()).toBe(chart.series());
  });

  it("keeps instances apart", () => {
    expect(new MemoizedChart().series()).not.toBe(new MemoizedChart().series());
  });

  it("releases an instance's results with the instance", async () => {
    requireGarbageCollection();

    const result = makeResultRef();
    await settleAndCollect();

    // The cache keys on the instance, so nothing outlives it. A cache keyed on
    // the method would hold every instance's results for the life of the tab.
    expect(result.deref()).toBeUndefined();
  });

  it("retains nothing once the instances are dropped", () => {
    requireGarbageCollection();

    driveInstances(0);

    const profile = profileCacheRetention({
      driveNewKeys: () => driveInstances(1_000),
      driveSameKeys: () => driveInstances(1_000),
      driveMoreNewKeys: () => driveInstances(2_000),
    });

    // eslint-disable-next-line no-console
    console.log(
      formatRetentionProfile(profile, {
        entryCount: INSTANCES_PER_PASS,
        entryLabel: `instances x ${CALLS_PER_INSTANCE} calls, all dropped`,
      }),
    );

    expect(profile.moreNewKeysMb).toBeLessThan(RETENTION_BUDGET_MB);
  });
});
