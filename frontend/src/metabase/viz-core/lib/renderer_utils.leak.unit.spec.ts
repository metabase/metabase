import { requireGarbageCollection, settleAndCollect } from "__support__/memory";
import { dayjs } from "metabase/dayjs";

import { parseXValue } from "./renderer_utils";

/** Parses one x value, then drops every reference to it. */
function makeParsedDayjsRef(): WeakRef<object> {
  const parsed = parseXValue("2031-05-06", { isTimeseries: true });
  if (!dayjs.isDayjs(parsed)) {
    throw new Error("expected the timeseries path to return a Dayjs");
  }
  return new WeakRef(parsed);
}

describe("renderer_utils parsed x value caching", () => {
  it("releases a parsed value once its caller is done", async () => {
    requireGarbageCollection();

    const parsed = makeParsedDayjsRef();
    await settleAndCollect();

    // The cache used to live at module scope, so one Dayjs per distinct
    // timestamp stayed on the heap for the life of the tab.
    expect(parsed.deref()).toBeUndefined();
  });
});
