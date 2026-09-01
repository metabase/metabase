import { ALL_OPERATOR_NAMES } from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";
import { OPERATOR_FORMATTER_FACTORIES } from "metabase/viz-core";

describe("table formatting operator contract", () => {
  it("should support all defined operators", () => {
    // This test is to remind anyone adding/removing operator support,
    // that the same should be done to `OPERATOR_FORMATTER_FACTORIES`.
    const supportedOperators = Object.keys(OPERATOR_FORMATTER_FACTORIES).sort();
    const definedOperators = Object.keys(ALL_OPERATOR_NAMES).sort();

    expect(supportedOperators).toEqual(definedOperators);
  });
});
