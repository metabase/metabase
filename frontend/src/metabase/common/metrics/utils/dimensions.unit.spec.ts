import { createMockMetricDimension } from "metabase-types/api/mocks";

import { getDimensionIcon } from "./dimensions";

describe("getDimensionIcon", () => {
  it("supports API metric dimensions", () => {
    expect(
      getDimensionIcon(
        createMockMetricDimension({
          effective_type: "type/Text",
          semantic_type: "type/Country",
        }),
      ),
    ).toBe("location");
    expect(
      getDimensionIcon(
        createMockMetricDimension({
          effective_type: "type/Integer",
          semantic_type: null,
        }),
      ),
    ).toBe("int");
  });
});
