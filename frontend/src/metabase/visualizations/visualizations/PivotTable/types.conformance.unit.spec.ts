import type * as Pivot from "cljs/metabase.pivot.js";

type IsUnknown<T> = unknown extends T
  ? [keyof T] extends [never]
    ? true
    : false
  : false;

type ExpectFalse<T extends false> = T;
type ProcessPivotTableReturnIsNotUnknown = ExpectFalse<
  IsUnknown<ReturnType<typeof Pivot.process_pivot_table>>
>;

type PivotHeader = ReturnType<
  typeof Pivot.process_pivot_table
>["leftHeaderItems"][number];

const processPivotTableReturnIsNotUnknown: ProcessPivotTableReturnIsNotUnknown = false;
const nullableHeaderClick: PivotHeader["clicked"] = null;

describe("pivot declarations", () => {
  it("keeps process_pivot_table return structural", () => {
    expect(processPivotTableReturnIsNotUnknown).toBe(false);
  });

  it("allows total headers without click data", () => {
    expect(nullableHeaderClick).toBeNull();
  });
});
