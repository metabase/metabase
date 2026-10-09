import { createMockCollection } from "metabase-types/api/mocks";

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

  it("opens a new regular collection in the main app", () => {
    const collection = createMockCollection({ id: 12, name: "Sales" });

    expect(getCreatedCollectionUrl(collection)).toBe("/collection/12-sales");
  });
});
