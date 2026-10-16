import { createMockColumn } from "metabase-types/api/mocks";

import { formatValue } from "./custom-viz-utils";

describe("formatValue", () => {
  it("applies number options to a number without a column", () => {
    expect(formatValue(0.084, { number_style: "percent", decimals: 1 })).toBe(
      "8.4%",
    );
  });

  it("applies prefix and suffix along with number options without a column", () => {
    expect(
      formatValue(1234.5, { decimals: 0, prefix: "~", suffix: " items" }),
    ).toBe("~1,235 items");
  });

  it("keeps a number without a column and number options as is", () => {
    expect(formatValue(2024)).toBe("2024");
    expect(formatValue(2024, { prefix: "#" })).toBe("#2024");
  });

  it("formats a number with a numeric column", () => {
    expect(
      formatValue(0.084, {
        column: createMockColumn({ base_type: "type/Float" }),
        number_style: "percent",
        decimals: 1,
      }),
    ).toBe("8.4%");
  });
});
