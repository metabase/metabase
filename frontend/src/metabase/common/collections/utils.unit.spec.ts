import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import {
  PERSONAL_COLLECTIONS,
  ROOT_COLLECTION,
} from "metabase/common/collections/constants";
import {
  buildCollectionTree,
  canonicalCollectionId,
  canonicalCollectionIdOrEntityId,
  getCollectionIcon,
  getCollectionPathAsString,
  isExamplesCollection,
  isItemCollection,
  isReadOnlyCollection,
  isRootCollection,
  isRootPersonalCollection,
  isRootTrashCollection,
  normalizedCollection,
} from "metabase/common/collections/utils";
import { type Collection, SEARCH_MODELS } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockSearchResult,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

describe("Collections > utils", () => {
  describe("isRootPersonalCollection", () => {
    it("returns true if personal_owner_id is a number", () => {
      const collection = { personal_owner_id: 1 };

      expect(isRootPersonalCollection(collection)).toBe(true);
    });

    it("returns false if personal_owner_id is not a number", () => {
      const collection = {};

      expect(isRootPersonalCollection(collection)).toBe(false);
    });
  });

  describe("isRootTrashCollection", () => {
    it("returns true if the collection type is 'trash'", () => {
      const collection = createMockCollection({ type: "trash" });
      expect(isRootTrashCollection(collection)).toBe(true);
    });

    it("returns false if the collection type is not 'trash'", () => {
      const collection = createMockCollection({ type: "instance-analytics" });
      expect(isRootTrashCollection(collection)).toBe(false);
    });

    it("returns false if the collection has no type", () => {
      expect(isRootTrashCollection(undefined)).toBe(false);
      expect(isRootTrashCollection({})).toBe(false);
      expect(isRootTrashCollection({ type: null })).toBe(false);
    });
  });

  describe("isExamplesCollection", () => {
    it("returns true if the collection is a sample collection named 'Examples'", () => {
      const collection = createMockCollection({
        is_sample: true,
        name: "Examples",
      });
      expect(isExamplesCollection(collection)).toBe(true);
    });

    it("returns false if the collection is a sample but not named 'Examples'", () => {
      const collection = createMockCollection({
        is_sample: true,
        name: "Sample Data",
      });
      expect(isExamplesCollection(collection)).toBe(false);
    });

    it("returns false if the collection is named 'Examples' but not a sample", () => {
      const collection = createMockCollection({
        is_sample: false,
        name: "Examples",
      });
      expect(isExamplesCollection(collection)).toBe(false);
    });

    it("returns false if the collection is neither a sample nor named 'Examples'", () => {
      const collection = createMockCollection({
        is_sample: false,
        name: "Regular Collection",
      });
      expect(isExamplesCollection(collection)).toBe(false);
    });

    it("returns false if the collection has no is_sample property", () => {
      expect(
        isExamplesCollection(createMockCollection({ name: "Examples" })),
      ).toBe(false);
    });
  });

  describe("canonicalCollectionId", () => {
    it("returns the id of the collection if it is not a root collection", () => {
      expect(canonicalCollectionId(1337)).toBe(1337);
      expect(canonicalCollectionId(1)).toBe(1);
    });

    it("handles string id inputs", () => {
      expect(canonicalCollectionId("1337")).toBe(1337);
      expect(canonicalCollectionId("1")).toBe(1);
    });

    it('returns null if the collection id is "root"', () => {
      expect(canonicalCollectionId("root")).toBe(null);
    });

    it("returns NaN if the collection id is entity id", () => {
      expect(canonicalCollectionId("HPAvJNTD9XTRkwJZUX9Fz")).toBe(NaN);
    });

    it("returns null if the collection id is null or undefined", () => {
      expect(canonicalCollectionId(null)).toBe(null);
      /* @ts-expect-error checking if a race condition not returning expected data behaves as expected */
      expect(canonicalCollectionId()).toBe(null);
    });
  });

  describe("canonicalCollectionIdOrEntityId", () => {
    it("returns the id of the collection if it is not a root collection", () => {
      expect(canonicalCollectionIdOrEntityId(1337)).toBe(1337);
      expect(canonicalCollectionIdOrEntityId(1)).toBe(1);
    });

    it("handles string id inputs", () => {
      expect(canonicalCollectionIdOrEntityId("1337")).toBe(1337);
      expect(canonicalCollectionIdOrEntityId("1")).toBe(1);
    });

    it('returns null if the collection id is "root"', () => {
      expect(canonicalCollectionIdOrEntityId("root")).toBe(null);
    });

    it("returns the id of the collection if the collection id is entity id", () => {
      expect(canonicalCollectionIdOrEntityId("HPAvJNTD9XTRkwJZUX9Fz")).toBe(
        "HPAvJNTD9XTRkwJZUX9Fz",
      );
    });

    it("returns null if the collection id is null or undefined", () => {
      expect(canonicalCollectionIdOrEntityId(null)).toBe(null);
      /* @ts-expect-error checking if a race condition not returning expected data behaves as expected */
      expect(canonicalCollectionIdOrEntityId()).toBe(null);
    });
  });

  describe("isRootCollection", () => {
    it("returns true if the collection is the root collection", () => {
      /* @ts-expect-error the null id should have been coerced to 'root' but lets make sure this still doesn't blow up */
      expect(isRootCollection(createMockCollection({ id: null }))).toBe(true);
      expect(isRootCollection(createMockCollection({ id: "root" }))).toBe(true);
      expect(isRootCollection(createMockCollection({ id: undefined }))).toBe(
        true,
      );
    });

    it("returns true if there is no collection", () => {
      /* @ts-expect-error checking if a race condition not returning expected data behaves as expected */
      expect(isRootCollection({})).toBe(true);
      expect(isRootCollection(null)).toBe(true);
      expect(isRootCollection(undefined)).toBe(true);
    });

    it("returns false if the collection is not the root collection", () => {
      expect(isRootCollection(createMockCollection({ id: 1 }))).toBe(false);
      expect(isRootCollection(createMockCollection({ id: "1" }))).toBe(false);
      expect(isRootCollection(createMockCollection({ id: "foobar" }))).toBe(
        false,
      );
    });
  });

  describe("isItemCollection", () => {
    it("returns true if the item is a collection", () => {
      expect(
        isItemCollection(createMockCollectionItem({ model: "collection" })),
      ).toBe(true);
    });

    it("returns false if the item is not a collection", () => {
      expect(
        isItemCollection(createMockCollectionItem({ model: "dashboard" })),
      ).toBe(false);
      expect(
        isItemCollection(createMockCollectionItem({ model: "card" })),
      ).toBe(false);
      expect(
        isItemCollection(createMockCollectionItem({ model: "dataset" })),
      ).toBe(false);
    });
  });

  describe("isReadOnlyCollection", () => {
    it("returns true if the collection is read only", () => {
      expect(
        isReadOnlyCollection(
          createMockCollectionItem({ model: "collection", can_write: false }),
        ),
      ).toBe(true);
    });

    it("returns false if the collection is not read only", () => {
      expect(
        isReadOnlyCollection(
          createMockCollectionItem({ model: "collection", can_write: true }),
        ),
      ).toBe(false);
    });

    it("returns false if the item is not a collection", () => {
      expect(
        isReadOnlyCollection(
          createMockCollectionItem({ model: "card", can_write: true }),
        ),
      ).toBe(false);
      expect(
        isReadOnlyCollection(
          createMockCollectionItem({ model: "card", can_write: false }),
        ),
      ).toBe(false);
    });
  });

  describe("getCollectionPathAsString", () => {
    it("should return path for collection without ancestors", () => {
      const collection = createMockCollection({
        id: 0,
        name: "Documents",
        effective_ancestors: [],
      });
      const pathString = getCollectionPathAsString(collection);
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
      const pathString = getCollectionPathAsString(collection);
      expect(pathString).toBe("Home / User / Files / Documents");
    });
  });

  describe("normalizedCollection", () => {
    describe("input edge cases", () => {
      it("returns ROOT_COLLECTION for null", () => {
        expect(normalizedCollection(null)).toBe(ROOT_COLLECTION);
      });

      it("returns ROOT_COLLECTION for undefined", () => {
        expect(normalizedCollection(undefined)).toBe(ROOT_COLLECTION);
      });
    });

    describe("root collection forms", () => {
      it.each([
        ["id is null", { id: null as never }],
        ["id is undefined", { id: undefined as never }],
        ['id is "root"', { id: "root" as const }],
      ])("returns ROOT_COLLECTION when %s", (_label, override) => {
        const collection = createMockCollection(override);
        expect(normalizedCollection(collection)).toBe(ROOT_COLLECTION);
      });
    });

    describe("non-root collections", () => {
      it("returns the collection unchanged for a regular collection", () => {
        const collection = createMockCollection({ id: 5, name: "Reports" });
        expect(normalizedCollection(collection)).toBe(collection);
      });

      it.each([
        ["personal", { id: 6, personal_owner_id: 1 }],
        ["trash", { id: 7, type: "trash" as const }],
        ["library", { id: 8, type: "library" as const }],
        ["instance-analytics", { id: 9, type: "instance-analytics" as const }],
        [
          "official authority level",
          { id: 10, authority_level: "official" as const },
        ],
        ["archived", { id: 11, archived: true }],
        ["nested (location set)", { id: 12, location: "/3/" }],
      ])(
        "returns the collection unchanged for a %s collection",
        (_label, override) => {
          const collection = createMockCollection(override);
          expect(normalizedCollection(collection)).toBe(collection);
        },
      );

      it("preserves every field on the input collection", () => {
        const collection = createMockCollection({
          id: 42,
          name: "Special",
          description: "A description",
          authority_level: "official",
          location: "/1/2/",
          archived: false,
        });
        expect(normalizedCollection(collection)).toEqual(collection);
      });
    });

    // The helper is invoked from search-result rendering paths
    // (InfoText, command palette) for every model that can carry a
    // `collection` field. Exercise each model to guard against a regression
    // where one model's collection shape is mishandled. Search results carry
    // CollectionEssentials, so we cast at the boundary the same way the
    // production call sites do.
    describe("for every search-result entity type", () => {
      it.each(SEARCH_MODELS)(
        "normalizes a non-root collection on a %s result",
        (model) => {
          const collection = createMockCollection({ id: 99, name: "Library" });
          const result = createMockSearchResult({ model, collection });
          expect(normalizedCollection(result.collection as Collection)).toEqual(
            collection,
          );
        },
      );

      it.each(SEARCH_MODELS)(
        "returns ROOT_COLLECTION for a root-collection %s result",
        (model) => {
          const result = createMockSearchResult({
            model,
            collection: createMockCollection({ id: "root" as const }),
          });
          expect(normalizedCollection(result.collection as Collection)).toBe(
            ROOT_COLLECTION,
          );
        },
      );
    });
  });

  describe("buildCollectionTree", () => {
    it("returns an empty array when collections are not passed", () => {
      expect(buildCollectionTree()).toEqual([]);
    });

    it("correctly transforms collections", () => {
      const collection = createMockCollection({ children: [] });
      const [transformed] = buildCollectionTree([collection]);
      expect(transformed).toMatchObject({
        id: collection.id,
        name: collection.name,
        schemaName: collection.name,
        icon: { name: "folder" },
        children: [],
      });
    });

    it("prefers originalName over name for schema names", () => {
      const collection = createMockCollection({
        name: "bar",
        originalName: "foo",
      });
      const [transformed] = buildCollectionTree([collection]);
      expect(transformed.schemaName).toBe(collection.originalName);
    });

    it("recursively transforms collection children", () => {
      const grandchild = createMockCollection({ id: 3, name: "C3" });
      const child = createMockCollection({
        id: 2,
        name: "C2",
        children: [grandchild],
      });
      const collection = createMockCollection({
        id: 1,
        name: "C1",
        children: [child],
      });

      const [transformed] = buildCollectionTree([collection]);

      expect(transformed).toMatchObject({
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
      const collection = createMockCollection({ authority_level: "official" });
      const [transformed] = buildCollectionTree([collection]);
      expect(transformed.icon).toEqual({ name: "folder" });
    });

    describe("filtering by models", () => {
      it("only keeps collection branches containing target models", () => {
        const grandchild1 = createMockCollection({
          id: 4,
          name: "Grandchild 1",
          here: ["dataset"],
        });
        const grandchild2 = createMockCollection({
          id: 3,
          name: "Grandchild 2",
          here: ["card"],
        });
        const child = createMockCollection({
          id: 2,
          name: "Child",
          below: ["dataset", "card"],
          children: [grandchild1, grandchild2],
        });
        const collection = createMockCollection({
          id: 1,
          name: "Top-level",
          below: ["dataset", "card"],
          children: [child],
        });

        const transformed = buildCollectionTree([collection], {
          modelFilter: (model) => model === "dataset",
        });

        expect(transformed).toMatchObject([
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
        const collectionWithDatasets = createMockCollection({
          id: 1,
          name: "Top-level",
          here: ["dataset"],
          children: [],
        });
        const collectionWithCards = createMockCollection({
          id: 5,
          name: "Top-level 2",
          below: ["card"],
        });

        const transformed = buildCollectionTree(
          [collectionWithDatasets, collectionWithCards],
          { modelFilter: (model) => model === "dataset" },
        );

        expect(transformed).toMatchObject([
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

      it("preserves personal collections root if there are other users personal collections with target models", () => {
        const collection = createMockCollection({
          ...PERSONAL_COLLECTIONS,
          children: [
            createMockCollection({
              name: "A",
              below: ["card"],
              children: [
                createMockCollection({
                  name: "A1",
                  here: ["card"],
                }),
              ],
            }),
            createMockCollection({
              name: "B",
              below: ["dataset"],
              children: [
                createMockCollection({
                  name: "B1",
                  here: ["dataset"],
                }),
              ],
            }),
            createMockCollection({
              name: "C",
              children: [
                createMockCollection({
                  name: "C1",
                }),
              ],
            }),
          ],
        });

        const collectionTree = buildCollectionTree([collection], {
          modelFilter: (model) => model === "card",
        });

        expect(collectionTree).toMatchObject([
          {
            ...PERSONAL_COLLECTIONS,
            children: [
              {
                name: "A",
                children: [
                  {
                    name: "A1",
                  },
                ],
              },
            ],
          },
        ]);
      });

      it("does not preserve personal collections root if there are no other users personal collections with target models", () => {
        const collection = createMockCollection({
          ...PERSONAL_COLLECTIONS,
          children: [
            createMockCollection({
              name: "A",
              here: ["dataset"],
              children: [
                createMockCollection({
                  name: "A1",
                }),
              ],
            }),
            createMockCollection({
              name: "B",
            }),
          ],
        });

        const collectionTree = buildCollectionTree([collection], {
          modelFilter: (model) => model === "card",
        });

        expect(collectionTree).toEqual([]);
      });

      it("doesn't filter collections if model filter is not passed", () => {
        const child = createMockCollection({
          id: 2,
          name: "Child",
          here: ["dataset"],
        });
        const collection = createMockCollection({
          id: 1,
          name: "Top-level",
          below: ["dataset"],
          children: [child],
        });
        const collectionWithCards = createMockCollection({
          id: 5,
          name: "Top-level 2",
          below: ["card"],
        });

        const transformed = buildCollectionTree([
          collection,
          collectionWithCards,
        ]);

        expect(transformed).toMatchObject([
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
        mockSettings({
          "token-features": createMockTokenFeatures({
            official_collections: true,
            audit_app: true,
          }),
        });
        setupEnterpriseOnlyPlugin("collections");
      });

      it("returns correct icon for official collections", () => {
        const collection = createMockCollection({
          authority_level: "official",
        });
        const [transformed] = buildCollectionTree([collection]);
        expect(transformed.icon).toEqual({
          color: expect.any(String),
          name: "official_collection",
          tooltip: "Official collection",
        });
      });
    });
  });

  describe("getCollectionIcon", () => {
    const commonTestCases = [
      {
        name: "Our analytics",
        collection: createMockCollection({ id: undefined }),
        expectedIcon: "folder",
      },
      {
        name: "All personal collections",
        collection: createMockCollection({ id: "personal" }),
        expectedIcon: "group",
      },
      {
        name: "Regular collection",
        collection: createMockCollection(),
        expectedIcon: "folder",
      },
      {
        name: "Personal collection",
        collection: createMockCollection({ personal_owner_id: 4 }),
        expectedIcon: "person",
      },
      {
        name: "Usage Analytics",
        collection: createMockCollection({ type: "instance-analytics" }),
        expectedIcon: "audit",
      },
    ];

    const testCasesOSS = [
      ...commonTestCases,
      // this is a good test, but due to (#29269) it fails currently
      // {
      //   name: "Official collection",
      //   collection: createMockCollection({ authority_level: "official"}),
      //   expectedIcon: "folder",
      // },
    ];

    const testCasesEE = [
      ...commonTestCases,
      {
        name: "Official collection",
        collection: createMockCollection({ authority_level: "official" }),
        expectedIcon: "official_collection",
      },
    ];

    describe("OSS", () => {
      testCasesOSS.forEach((testCase) => {
        const { name, collection, expectedIcon } = testCase;

        it(`returns '${expectedIcon}' for '${name}'`, () => {
          expect(getCollectionIcon(collection)).toMatchObject({
            name: expectedIcon,
          });
        });
      });
    });

    describe("EE", () => {
      beforeEach(() => {
        mockSettings({
          "token-features": createMockTokenFeatures({
            official_collections: true,
            audit_app: true,
          }),
        });
        setupEnterpriseOnlyPlugin("collections");
      });

      testCasesEE.forEach((testCase) => {
        const { name, collection, expectedIcon } = testCase;

        it(`returns '${expectedIcon}' for '${name}'`, () => {
          expect(getCollectionIcon(collection)).toMatchObject({
            name: expectedIcon,
          });
        });
      });
    });
  });
});
