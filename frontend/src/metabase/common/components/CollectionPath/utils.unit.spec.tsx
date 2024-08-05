import { createMockCollection } from "metabase-types/api/mocks";

import { getCollectionPathString } from "./utils";

describe("getCollectionPathString", () => {
  it("should return path for collection without ancestors", () => {
    const collection = createMockCollection({
      id: 0,
      name: "Documents",
      effective_ancestors: [],
    });
    const pathString = getCollectionPathString(collection);
    expect(pathString).toBe("Documents");
  });

  it("should return path for collection with multiple ancestors", () => {
    const ancestors = [
      createMockCollection({ name: "Home" }),
      createMockCollection({ name: "User" }),
      createMockCollection({ name: "Files" }),
    ];
    const collection = createMockCollection({
      name: "Documents",
      effective_ancestors: ancestors,
    });
    const pathString = getCollectionPathString(collection);
    expect(pathString).toBe("Home / User / Files / Documents");
  });
});
