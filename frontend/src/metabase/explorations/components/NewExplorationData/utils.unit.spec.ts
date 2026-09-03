import { createMockMetricDimension } from "metabase-types/api/mocks/metric";

import { formatDimensionLabel } from "./utils";

describe("formatDimensionLabel", () => {
  it("uses the dimension's own curated name, not an '<origin> - <name>' combination", () => {
    expect(
      formatDimensionLabel(
        createMockMetricDimension({
          id: "d1",
          display_name: "Created At",
          group: { id: "grp", type: "main", display_name: "Orders" },
        }),
      ),
    ).toBe("Created At");
  });

  it("falls back to the id when the dimension has no display name", () => {
    expect(
      formatDimensionLabel(
        createMockMetricDimension({ id: "d2", display_name: undefined }),
      ),
    ).toBe("d2");
  });
});
