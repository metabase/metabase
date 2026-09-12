import type { DrillThru } from "./types";

type ExpectFalse<T extends false> = T;
type DrillThruTypeIncludesInternalMarker = ExpectFalse<
  "metabase.lib.drill-thru/drill-thru" extends DrillThru["type"] ? true : false
>;

const drillThruTypeIncludesInternalMarker: DrillThruTypeIncludesInternalMarker = false;

describe("query type declarations", () => {
  it("excludes the internal drill marker from the public discriminator", () => {
    expect(drillThruTypeIncludesInternalMarker).toBe(false);
  });
});
