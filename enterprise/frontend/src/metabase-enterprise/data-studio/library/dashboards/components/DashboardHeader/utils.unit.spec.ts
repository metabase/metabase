import { createMockCollection } from "metabase-types/api/mocks";

import { getDashboardLocation } from "./utils";

const LIBRARY = createMockCollection({ id: 1, type: "library" });
const DASHBOARDS = createMockCollection({ id: 2, type: "library-dashboards" });
const SALES = createMockCollection({ id: 3, type: "library-dashboards" });
const EMEA = createMockCollection({ id: 4, type: "library-dashboards" });
const EXAMPLES = createMockCollection({ id: 5, type: null });

describe("getDashboardLocation", () => {
  it("is in the Library with the folders below the Dashboards section", () => {
    expect(getDashboardLocation([LIBRARY, DASHBOARDS, SALES, EMEA])).toEqual({
      type: "library",
      folders: [SALES, EMEA],
    });
  });

  it("is in the Library with no folders at the section root", () => {
    expect(getDashboardLocation([LIBRARY, DASHBOARDS])).toEqual({
      type: "library",
      folders: [],
    });
  });

  it("is in a collection with its path outside the Dashboards section", () => {
    expect(getDashboardLocation([EXAMPLES])).toEqual({
      type: "collection",
      path: [EXAMPLES],
    });
  });
});
