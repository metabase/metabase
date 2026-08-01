import { createMockCollectionItem } from "metabase-types/api/mocks";

import { getContentStudioItemUrl } from "./item-urls";

describe("getContentStudioItemUrl", () => {
  it("keeps sub-collections inside Content Studio", () => {
    const item = createMockCollectionItem({
      id: 12,
      model: "collection",
      name: "Reports",
    });

    expect(getContentStudioItemUrl(item)).toBe(
      "/content-studio/collection/12-reports",
    );
  });

  it.each(["card", "dataset", "metric"] as const)(
    "opens a %s on the hosted question page",
    (model) => {
      const item = createMockCollectionItem({
        id: 7,
        model,
        name: "Revenue",
      });

      expect(getContentStudioItemUrl(item)).toBe(
        "/content-studio/question/7-revenue",
      );
    },
  );

  it.each([
    ["dashboard", "/dashboard/7-revenue"],
    ["document", "/document/7"],
  ] as const)("sends a %s to its main app route", (model, expectedUrl) => {
    const item = createMockCollectionItem({
      id: 7,
      model,
      name: "Revenue",
    });

    expect(getContentStudioItemUrl(item)).toBe(expectedUrl);
  });
});
