import { createMockCollection } from "metabase-types/api/mocks";

import { getDashboardFolders } from "./utils";

const LIBRARY = createMockCollection({ id: 1, type: "library" });
const DASHBOARDS = createMockCollection({ id: 2, type: "library-dashboards" });
const SALES = createMockCollection({ id: 3, type: "library-dashboards" });
const EMEA = createMockCollection({ id: 4, type: "library-dashboards" });

describe("getDashboardFolders", () => {
  it("returns the folders below the Dashboards section", () => {
    expect(getDashboardFolders([LIBRARY, DASHBOARDS, SALES, EMEA])).toEqual([
      SALES,
      EMEA,
    ]);
  });

  it("returns no folders for a dashboard at the section root", () => {
    expect(getDashboardFolders([LIBRARY, DASHBOARDS])).toEqual([]);
  });

  it("returns no folders outside the Dashboards section", () => {
    expect(
      getDashboardFolders([createMockCollection({ id: 5, type: null })]),
    ).toEqual([]);
  });
});
