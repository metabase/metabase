import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { getCreatedCollectionUrl } from "./CreateCollectionModal";

describe("getCreatedCollectionUrl", () => {
  it("opens a new data actions folder on the Data actions tab with its path expanded", () => {
    const collection = createMockCollection({
      id: 12,
      namespace: "data-actions",
      location: "/10/",
    });

    expect(getCreatedCollectionUrl(collection)).toBe(
      "/data-studio/actions?expandedId=10&expandedId=12",
    );
  });

  it("opens a new snippet folder on the SQL snippets tab with its path expanded", () => {
    const collection = createMockCollection({
      id: 12,
      namespace: "snippets",
      location: "/10/",
    });

    expect(getCreatedCollectionUrl(collection)).toBe(
      "/data-studio/snippets?expandedId=10&expandedId=12",
    );
  });

  it.each([
    {
      name: "a top-level folder",
      location: "/7/10/",
      expectedUrl: "/data-studio/dashboards?expandedId=12",
    },
    {
      name: "a nested folder",
      location: "/7/10/11/",
      expectedUrl: "/data-studio/dashboards?expandedId=11&expandedId=12",
    },
  ])(
    "opens $name on the Dashboards tab with only its folders expanded",
    ({ location, expectedUrl }) => {
      const collection = createMockCollection({
        id: 12,
        type: "library-dashboards",
        location,
      });

      expect(getCreatedCollectionUrl(collection)).toBe(expectedUrl);
    },
  );

  it("opens a new Semantic layer folder with its whole path expanded", () => {
    mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    });
    setupEnterpriseOnlyPlugin("library");
    const collection = createMockCollection({
      id: 12,
      type: "library-metrics",
      location: "/7/9/",
    });

    expect(getCreatedCollectionUrl(collection)).toBe(
      "/data-studio/library?expandedId=7&expandedId=9&expandedId=12",
    );
  });

  it("opens a new regular collection in the main app", () => {
    const collection = createMockCollection({ id: 12, name: "Sales" });

    expect(getCreatedCollectionUrl(collection)).toBe("/collection/12-sales");
  });
});
