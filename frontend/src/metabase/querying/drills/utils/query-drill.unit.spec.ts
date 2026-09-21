import type { ClickObject, DrillThruDisplayInfo } from "metabase-lib";
import { createMockColumn } from "metabase-types/api/mocks";

import { isGroupedDimensionClick, shouldHideDrill } from "./query-drill";

const groupedDimensionClick: ClickObject = {
  dimensions: [
    {
      column: createMockColumn(),
      value: ["Gizmo", "Doohickey"],
    },
  ],
};

describe("isGroupedDimensionClick", () => {
  it("detects clicks with grouped dimension values", () => {
    expect(isGroupedDimensionClick(groupedDimensionClick)).toBe(true);
  });

  it("ignores clicks with regular dimension values", () => {
    const clicked: ClickObject = {
      dimensions: [
        {
          column: createMockColumn(),
          value: "Gizmo",
        },
      ],
    };

    expect(isGroupedDimensionClick(clicked)).toBe(false);
  });
});

describe("shouldHideDrill", () => {
  it("keeps underlying records for grouped dimension clicks", () => {
    const drillInfo: DrillThruDisplayInfo = {
      type: "drill-thru/underlying-records",
      rowCount: 2,
      tableName: "Products",
    };

    expect(shouldHideDrill(drillInfo, groupedDimensionClick)).toBe(false);
  });

  it("hides other drills for grouped dimension clicks", () => {
    const drillInfo: DrillThruDisplayInfo = {
      type: "drill-thru/pivot",
    };

    expect(shouldHideDrill(drillInfo, groupedDimensionClick)).toBe(true);
  });
});
