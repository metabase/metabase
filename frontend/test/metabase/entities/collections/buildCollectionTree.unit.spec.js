import { setupEnterpriseTest } from "__support__/enterprise";
import { buildCollectionTree } from "metabase/entities/collections";

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
    const grandchild = getCollection({ id: 3, name: "C3" });
    const child = getCollection({
      id: 2,
      name: "C2",
      children: [grandchild],
    });
    const collection = getCollection({
      id: 1,
      name: "C1",
      children: [child],
    });

    const [transformed] = buildCollectionTree([collection]);

    expect(transformed).toEqual({
      id: collection.id,
      name: collection.name,
      schemaName: collection.name,
      icon: { name: "folder" },
      children: [
        {
          id: child.id,
          name: child.name,
          schemaName: child.name,
          icon: { name: "folder" },
          children: [
            {
              id: grandchild.id,
              name: grandchild.name,
              schemaName: grandchild.name,
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

  describe("filtering by models", () => {
    it("only keeps collection branches containing target models", () => {
      const grandchild1 = getCollection({
        id: 4,
        name: "Grandchild 1",
        here: ["dataset"],
      });
      const grandchild2 = getCollection({
        id: 3,
        name: "Grandchild 2",
        here: ["card"],
      });
      const child = getCollection({
        id: 2,
        name: "Child",
        below: ["dataset", "card"],
        children: [grandchild1, grandchild2],
      });
      const collection = getCollection({
        id: 1,
        name: "Top-level",
        below: ["dataset", "card"],
        children: [child],
      });

      const transformed = buildCollectionTree([collection], {
        targetModels: ["dataset"],
      });

      expect(transformed).toEqual([
        {
          id: collection.id,
          name: collection.name,
          schemaName: collection.name,
          icon: { name: "folder" },
          below: ["dataset", "card"],
          children: [
            {
              id: child.id,
              name: child.name,
              schemaName: child.name,
              below: ["dataset", "card"],
              icon: { name: "folder" },
              children: [
                {
                  id: grandchild1.id,
                  name: grandchild1.name,
                  schemaName: grandchild1.name,
                  icon: { name: "folder" },
                  children: [],
                  here: ["dataset"],
                },
              ],
            },
          ],
        },
      ]);
    });

    it("filters top-level collections not containing target models", () => {
      const collectionWithDatasets = getCollection({
        id: 1,
        name: "Top-level",
        here: ["dataset"],
        children: [],
      });
      const collectionWithCards = getCollection({
        id: 5,
        name: "Top-level 2",
        below: ["card"],
      });

      const transformed = buildCollectionTree(
        [collectionWithDatasets, collectionWithCards],
        {
          targetModels: ["dataset"],
        },
      );

      expect(transformed).toEqual([
        {
          id: collectionWithDatasets.id,
          name: collectionWithDatasets.name,
          schemaName: collectionWithDatasets.name,
          icon: { name: "folder" },
          here: ["dataset"],
          children: [],
        },
      ]);
    });

    it("doesn't filter collections if targetModels are not passed", () => {
      const child = getCollection({ id: 2, name: "Child", here: ["dataset"] });
      const collection = getCollection({
        id: 1,
        name: "Top-level",
        below: ["dataset"],
        children: [child],
      });
      const collectionWithCards = getCollection({
        id: 5,
        name: "Top-level 2",
        below: ["card"],
      });

      const transformed = buildCollectionTree([
        collection,
        collectionWithCards,
      ]);

      expect(transformed).toEqual([
        {
          id: collection.id,
          name: collection.name,
          schemaName: collection.name,
          icon: { name: "folder" },
          below: ["dataset"],
          children: [
            {
              id: child.id,
              name: child.name,
              schemaName: child.name,
              icon: { name: "folder" },
              here: ["dataset"],
              children: [],
            },
          ],
        },
        {
          id: collectionWithCards.id,
          name: collectionWithCards.name,
          schemaName: collectionWithCards.name,
          icon: { name: "folder" },
          children: [],
          below: ["card"],
        },
      ]);
    });
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
