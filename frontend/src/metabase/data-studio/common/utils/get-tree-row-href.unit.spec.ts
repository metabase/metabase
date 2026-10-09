import { createMockCollectionItem } from "metabase-types/api/mocks";

import { getTreeRowHref } from "./get-tree-row-href";

describe("getTreeRowHref", () => {
  it("links dashboards to the main app's dashboard page", () => {
    const href = getTreeRowHref({
      original: {
        id: "dashboard:7",
        name: "Sales",
        icon: "dashboard",
        model: "dashboard",
        data: createMockCollectionItem({ id: 7, model: "dashboard" }),
      },
    });

    expect(href).toBe("/dashboard/7-sales");
  });
});
