import { OPERATORS } from "metabase/lib/schema_metadata";
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
    const supportedOperators = new Set(
      Object.keys(OPERATOR_FORMATTER_FACTORIES),
    );
    const definedOperators = new Set(Object.keys(OPERATORS));

    expect(supportedOperators).toEqual(definedOperators);
  });
});
