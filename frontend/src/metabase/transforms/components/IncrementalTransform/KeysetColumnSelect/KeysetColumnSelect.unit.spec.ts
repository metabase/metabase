import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getSourceFieldOptions } from "./KeysetColumnSelect";

const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [{ source: { type: "table", id: ORDERS_ID } }],
});

describe("getSourceFieldOptions", () => {
  it("marks only date/datetime columns as supporting a lookback", () => {
    const options = getSourceFieldOptions(query);
    const supportsLookbackByFieldId = new Map(
      options.map(({ value, supportsLookback }) => [value, supportsLookback]),
    );

    expect(supportsLookbackByFieldId.get(String(ORDERS.CREATED_AT))).toBe(true);
    expect(supportsLookbackByFieldId.get(String(ORDERS.TOTAL))).toBe(false);
  });
});
