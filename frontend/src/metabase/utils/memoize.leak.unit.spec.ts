import { requireGarbageCollection, settleAndCollect } from "__support__/memory";
import { memoizeClass } from "metabase/utils/memoize";

class Chart {
  series() {
    return { rows: [1, 2, 3] };
  }
}

const MemoizedChart = memoizeClass<Chart>("series")(Chart);

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
});
