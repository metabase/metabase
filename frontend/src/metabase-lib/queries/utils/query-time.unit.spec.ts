import { ORDERS } from "metabase-types/api/mocks/presets";
import { generateTimeFilterValuesDescriptions } from "metabase-lib/queries/utils/query-time";

describe("generateTimeFilterValuesDescriptions", () => {
  it("should support date field with temporal-unit setting", () => {
    const filter = [
      "between",
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "month-of-year" }],
      3.5518686127011723,
      8.256492942128451,
    ];

    expect(generateTimeFilterValuesDescriptions(filter)).toStrictEqual([
      3.5518686127011723, 8.256492942128451,
    ]);
  });
});
