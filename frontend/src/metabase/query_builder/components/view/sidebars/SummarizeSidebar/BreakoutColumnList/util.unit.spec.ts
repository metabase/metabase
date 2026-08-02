import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER, columnFinder } from "metabase-lib/test-helpers";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import { getBreakoutListItem } from "./util";

const STAGE_INDEX = -1;

function createQueryWithBinnedBreakout() {
  const baseQuery = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  });

  const columns = Lib.breakoutableColumns(baseQuery, STAGE_INDEX);
  const priceColumn = columnFinder(baseQuery, columns)("PRODUCTS", "PRICE");
  const binnedColumn = Lib.withDefaultBinning(
    baseQuery,
    STAGE_INDEX,
    priceColumn,
  );

  return Lib.breakout(baseQuery, STAGE_INDEX, binnedColumn);
}

describe("BreakoutColumnList/util getBreakoutListItem (metabase#57697)", () => {
  it("should not include the binning strategy in the display name of a binned breakout column", () => {
    const query = createQueryWithBinnedBreakout();
    const [breakout] = Lib.breakouts(query, STAGE_INDEX);

    const item = getBreakoutListItem(query, STAGE_INDEX, breakout);

    expect(item?.displayName).toBe("Price");
    expect(item?.displayName).not.toBe("Price: Auto binned");
  });
});
