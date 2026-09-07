import {
  formatRetentionProfile,
  profileCacheRetention,
  requireGarbageCollection,
  settleAndCollect,
} from "__support__/memory";
import { memoize } from "metabase/utils/memoize";

const INSTANCES_PER_PASS = 2_000;
const CALLS_PER_INSTANCE = 20;

// 2,000 instances x 20 calls, so a cache that outlived its instance would show.
const RETENTION_BUDGET_MB = 1;

/** The pattern that replaced memoizeClass: a memoized arrow on a class field. */
class Chart {
  series = memoize(() => ({ rows: [1, 2, 3] }));

  slice = memoize((index: number, options: { label: string }) => ({
    index,
    label: options.label,
    rows: [1, 2, 3],
  }));
}

function makeResultRef(): WeakRef<object> {
  const chart = new Chart();
  return new WeakRef(chart.series());
}

function driveInstances(firstIndex: number) {
  for (let i = 0; i < INSTANCES_PER_PASS; i++) {
    const chart = new Chart();
    for (let call = 0; call < CALLS_PER_INSTANCE; call++) {
      chart.series();
      chart.slice(firstIndex + call, { label: `slice ${call}` });
    }
  }
}

describe("a memoized class field", () => {
  it("returns the identical result for one instance", () => {
    const chart = new Chart();

    expect(chart.series()).toBe(chart.series());
  });

  it("keeps instances apart", () => {
    expect(new Chart().series()).not.toBe(new Chart().series());
  });

  it("releases an instance's results with the instance", async () => {
    requireGarbageCollection();

    const result = makeResultRef();
    await settleAndCollect();

    // The field is created per instance, so nothing outlives it. A cache built
    // once on the prototype would hold every instance's results instead.
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
