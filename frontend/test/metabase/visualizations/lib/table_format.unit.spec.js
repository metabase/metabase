import { ALL_OPERATOR_NAMES } from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";
import {
  OPERATOR_FORMATTER_FACTORIES,
  compileFormatter,
} from "metabase/visualizations/lib/table_format";

describe("compileFormatter", () => {
  it("should return a function, even for unsupported operators", () => {
    const formatter = compileFormatter({
      type: "single",
      operator: "this-non-existant-operator-is-used-for-testing",
    });

    expect(formatter).toBeDefined();
  });

  it("should support all defined operators", () => {
    // This test is to remind anyone adding/removing operator support, that the
    // same should be done to `OPERATOR_FORMATTER_FACTORIES`.
    const supportedOperators = Object.keys(OPERATOR_FORMATTER_FACTORIES).sort();
    const definedOperators = Object.keys(ALL_OPERATOR_NAMES).sort();

    expect(supportedOperators).toEqual(definedOperators);
  });
});
