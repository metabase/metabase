import { setupEnterpriseTest } from "__support__/enterprise";
import { buildCollectionTree } from "./utils";

function getCollection({
  id = 1,
  name = "Collection",
  children = [],
  ...rest
} = {}) {
  return {
    id,
    name,
    children,
    ...rest,
  };
}

describe("buildCollectionTree", () => {
  it("returns an empty array when collections are not passed", () => {
    expect(buildCollectionTree()).toEqual([]);
  });

  it("correctly transforms collections", () => {
    const collection = getCollection({ children: [] });
    const [transformed] = buildCollectionTree([collection]);
    expect(transformed).toEqual({
      id: collection.id,
      name: collection.name,
      schemaName: collection.name,
      icon: { name: "folder" },
      children: [],
    });
  });

  it("prefers originalName over name for schema names", () => {
    const collection = getCollection({ name: "bar", originalName: "foo" });
    const [transformed] = buildCollectionTree([collection]);
    expect(transformed.schemaName).toBe(collection.originalName);
  });

  it("recursively transforms collection children", () => {
    const secondChild = getCollection({ id: 3, name: "C3" });
    const firstChild = getCollection({
      id: 2,
      name: "C2",
      children: [secondChild],
    });
    const collection = getCollection({
      id: 1,
      name: "C1",
      children: [firstChild],
    });

    const [transformed] = buildCollectionTree([collection]);

    expect(transformed).toEqual({
      id: collection.id,
      name: collection.name,
      schemaName: collection.name,
      icon: { name: "folder" },
      children: [
        {
          id: firstChild.id,
          name: firstChild.name,
          schemaName: firstChild.name,
          icon: { name: "folder" },
          children: [
            {
              id: secondChild.id,
              name: secondChild.name,
              schemaName: secondChild.name,
              icon: { name: "folder" },
              children: [],
            },
          ],
        },
      ],
    });
  });

  it("returns regular icon for official collections in OSS", () => {
    const collection = getCollection({ authority_level: "official" });
    const [transformed] = buildCollectionTree([collection]);
    expect(transformed.icon).toEqual({ name: "folder" });
  });

  describe("EE", () => {
    beforeEach(() => {
      setupEnterpriseTest();
    });

    it("returns correct icon for official collections", () => {
      const collection = getCollection({ authority_level: "official" });
      const [transformed] = buildCollectionTree([collection]);
      expect(transformed.icon).toEqual({
        color: expect.any(String),
        name: "badge",
        tooltip: "Official collection",
      });
    });
  });
});
