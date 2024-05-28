import { setupEnterpriseTest } from "__support__/enterprise";
import { createMockCollection } from "metabase-types/api/mocks";

import { PERSONAL_COLLECTIONS } from "./constants";
import {
  buildCollectionTree,
  getCollectionIcon,
  // getCollectionTooltip,
} from "./utils";

describe("entities > collections > utils", () => {
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

        const transformed = buildCollectionTree(
          [collection],
          model => model === "dataset",
        );

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
          model => model === "dataset",
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

        const collectionTree = buildCollectionTree(
          [collection],
          model => model === "card",
        );

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

        const collectionTree = buildCollectionTree(
          [collection],
          model => model === "card",
        );

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
        setupEnterpriseTest();
      });

      it("returns correct icon for official collections", () => {
        const collection = createMockCollection({
          authority_level: "official",
        });
        const [transformed] = buildCollectionTree([collection]);
        expect(transformed.icon).toEqual({
          color: expect.any(String),
          name: "badge",
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
        name: "Metabase Analytics",
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
        expectedIcon: "badge",
      },
    ];

    describe("OSS", () => {
      testCasesOSS.forEach(testCase => {
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
        setupEnterpriseTest();
      });

      testCasesEE.forEach(testCase => {
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
