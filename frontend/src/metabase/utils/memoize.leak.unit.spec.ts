import { requireGarbageCollection, settleAndCollect } from "__support__/memory";
import { memoize } from "metabase/utils/memoize";

/** The pattern that replaced memoizeClass: a memoized arrow on a class field. */
class Chart {
  series = memoize(() => ({ rows: [1, 2, 3] }));
}

function makeResultRef(): WeakRef<object> {
  return new WeakRef(new Chart().series());
}

describe("a memoized class field", () => {
  it("releases an instance's results with the instance", async () => {
    requireGarbageCollection();

    const result = makeResultRef();
    await settleAndCollect();

    // The field is created per instance, so nothing outlives it. A cache built
    // once on the prototype would hold every instance's results instead.
    expect(result.deref()).toBeUndefined();
  });
});
