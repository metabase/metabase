import {
  bookmark,
  browseDatabase,
  collection,
  dashboard,
  dataApp,
  question,
  extractQueryParams,
  extractEntityId,
  extractCollectionId,
  isCollectionPath,
} from "metabase/lib/urls";
import {
  createMockDataApp,
  createMockCollection,
} from "metabase-types/api/mocks";

describe("urls", () => {
  describe("question", () => {
    describe("with a query", () => {
      it("returns the correct url", () => {
        expect(question({}, { query: { foo: "bar" } })).toEqual(
          "/question?foo=bar",
        );
        expect(question({}, { hash: "hash", query: { foo: "bar" } })).toEqual(
          "/question?foo=bar#hash",
        );
        expect(question(null, { hash: "hash", query: { foo: "bar" } })).toEqual(
          "/question?foo=bar#hash",
        );
        expect(question(null, { query: { foo: "bar" } })).toEqual(
          "/question?foo=bar",
        );
        expect(question(null, { query: { foo: "bar+bar" } })).toEqual(
          "/question?foo=bar%2Bbar",
        );
        expect(question(null, { query: { foo: ["bar", "baz"] } })).toEqual(
          "/question?foo=bar&foo=baz",
        );
        expect(question(null, { query: { foo: ["bar", "baz+bay"] } })).toEqual(
          "/question?foo=bar&foo=baz%2Bbay",
        );
        expect(question(null, { query: { foo: ["bar", "baz&bay"] } })).toEqual(
          "/question?foo=bar&foo=baz%26bay",
        );
      });

      it("does not include undefined params", () => {
        expect(question(null, { query: { foo: undefined } })).toEqual(
          "/question",
        );
        expect(
          question(null, { query: { foo: undefined, bar: "bar" } }),
        ).toEqual("/question?bar=bar");
      });

      it("includes null params", () => {
        expect(question(null, { query: { foo: null } })).toEqual(
          "/question?foo=null",
        );
      });
    });

    describe("question ids", () => {
      it("returns the correct url", () => {
        expect(question(null)).toEqual("/question");
        expect(question({ id: 1 })).toEqual("/question/1");

        /**
         * If we're dealing with the question in a dashboard, we're reading the dashCard properties.
         * Make sure `card_id` gets assigned to the question url.
         */

        expect(question({ id: 1, card_id: 42, name: "Foo" })).toEqual(
          "/question/42-foo",
        );

        /** Symbol-based languages are unsupported. Such names result in the `name` being dropped.
         * Please see: https://github.com/metabase/metabase/pull/15989#pullrequestreview-656646149
         *
         * * We still have to make sure links to questions in a dashboard render correctly.
         */

        expect(question({ id: 1, card_id: 42 })).toEqual("/question/42");

        expect(question({ id: 1, card_id: 42, name: "ベーコン" })).toEqual(
          "/question/42",
        );
        expect(question({ id: 1, card_id: 42, name: "培根" })).toEqual(
          "/question/42",
        );
      });
    });

    describe("with object ID", () => {
      it("should append object ID to path", () => {
        const url = question({ id: 1 }, { objectId: 5 });
        expect(url).toBe("/question/1/5");
      });

      it("should support query params", () => {
        const url = question({ id: 1 }, { query: "?a=b", objectId: 5 });
        expect(url).toBe("/question/1/5?a=b");
      });

      it("should support hash", () => {
        const url = question({ id: 1 }, { hash: "abc", objectId: 5 });
        expect(url).toBe("/question/1/5#abc");
      });

      it("should support both hash and query params", () => {
        const url = question(
          { id: 1, name: "foo" },
          { hash: "abc", query: "a=b", objectId: 5 },
        );
        expect(url).toBe("/question/1-foo/5?a=b#abc");
      });
    });

    describe("model", () => {
      it("returns /model URLS", () => {
        expect(question({ id: 1, dataset: true, name: "Foo" })).toEqual(
          "/model/1-foo",
        );

        expect(
          question({ id: 1, card_id: 42, dataset: true, name: "Foo" }),
        ).toEqual("/model/42-foo");

        expect(
          question({ id: 1, card_id: 42, model: "dataset", name: "Foo" }),
        ).toEqual("/model/42-foo");

        expect(
          question({ id: 1, dataset: true, name: "Foo" }, { objectId: 4 }),
        ).toEqual("/model/1-foo/4");
      });
    });
  });

  describe("query", () => {
    it("should return the correct number of parameters", () => {
      expect(extractQueryParams({ foo: "bar" })).toHaveLength(1);
      expect(extractQueryParams({ foo: [1, 2, 3] })).toHaveLength(3);
      expect(extractQueryParams({ foo: ["1", "2"] })).toHaveLength(2);
      expect(
        extractQueryParams({
          foo1: ["baz1", "baz2"],
          foo2: [1, 2, 3],
          foo3: ["bar1", "bar2"],
        }),
      ).toHaveLength(7);
    });
    it("should return correct parameters", () => {
      expect(extractQueryParams({ foo: "bar" })).toEqual([["foo", "bar"]]);

      const extractedParams1 = extractQueryParams({ foo: [1, 2, 3] });
      expect(extractedParams1).toContainEqual(["foo", 1]);
      expect(extractedParams1).toContainEqual(["foo", 2]);
      expect(extractedParams1).toContainEqual(["foo", 3]);

      const extractedParams2 = extractQueryParams({ foo: ["1", "2"] });
      expect(extractedParams2).toContainEqual(["foo", "1"]);
      expect(extractedParams2).toContainEqual(["foo", "2"]);
    });
  });

  describe("collections", () => {
    it("returns root URL if collection is not passed", () => {
      expect(collection()).toBe("/collection/root");
    });

    it("resolves /root and /users collections", () => {
      expect(collection({ id: "root" })).toBe("/collection/root");
      expect(collection({ id: "users" })).toBe("/collection/users");
    });

    it("should treat `null` ID as a root collection", () => {
      expect(collection({ id: null })).toBe("/collection/root");
    });

    it("returns correct url", () => {
      expect(collection({ id: 1, name: "First collection" })).toBe(
        "/collection/1-first-collection",
      );

      expect(
        collection({
          id: 1,
          slug: "first_collection",
          name: "First collection",
        }),
      ).toBe("/collection/1-first-collection");
    });

    it("handles possessives correctly", () => {
      expect(
        collection({
          id: 1,
          name: "John Doe's Personal Collection",
          personal_owner_id: 1,
        }),
      ).toBe("/collection/1-john-doe-s-personal-collection");
    });

    it("omits possessive form if name can't be turned into a slug", () => {
      expect(
        collection({
          id: 1,
          name: "🍎's Personal Collection",
          personal_owner_id: 1,
        }),
      ).toBe("/collection/1-personal-collection");
    });

    it("uses originalName to build a slug if present", () => {
      expect(
        collection({
          id: 1,
          name: "Your personal collection",
          originalName: "John Doe's Personal Collection",
          personal_owner_id: 1,
        }),
      ).toBe("/collection/1-john-doe-s-personal-collection");
    });

    it("handles data app collections", () => {
      const appCollection = createMockCollection({
        id: 2,
        app_id: 5,
        name: "My App",
      });
      expect(collection(appCollection)).toBe("/apps/5-my-app");
    });
  });

  describe("dataApp", () => {
    const appCollection = createMockCollection({ id: 1 });
    const app = createMockDataApp({ id: 2, collection: appCollection });

    const appId = app.id;
    const appName = appCollection.name.toLowerCase();

    const appSearchItem = {
      id: appCollection.id,
      app_id: app.id,
      collection: { ...appCollection, app_id: app.id },
    };

    it("returns data app preview URL", () => {
      expect(dataApp(app, { mode: "preview" })).toBe(
        `/apps/${appId}-${appName}`,
      );
    });

    it("returns data app internal URL", () => {
      expect(dataApp(app, { mode: "internal" })).toBe(`/a/${appId}-${appName}`);
    });

    it("returns data app preview URL out of search result item", () => {
      expect(dataApp(appSearchItem, { mode: "preview" })).toBe(
        `/apps/${appId}-${appName}`,
      );
    });

    it("returns data app internal URL out of search result item", () => {
      expect(dataApp(appSearchItem, { mode: "internal" })).toBe(
        `/a/${appId}-${appName}`,
      );
    });
  });

  describe("bookmarks", () => {
    it("returns card bookmark path", () => {
      expect(
        bookmark({
          id: "card-5",
          dataset: false,
          name: "Orders",
          type: "card",
        }),
      ).toBe("/question/5-orders");
    });

    it("returns model bookmark path", () => {
      expect(
        bookmark({
          id: "card-1",
          dataset: true,
          name: "Product",
          type: "card",
        }),
      ).toBe("/model/1-product");
    });

    it("returns dashboard bookmark path", () => {
      expect(
        bookmark({
          id: "dashboard-3",
          name: "Shop Stats",
          type: "dashboard",
        }),
      ).toBe("/dashboard/3-shop-stats");
    });

    it("returns collection bookmark path", () => {
      expect(
        bookmark({
          id: "collection-8",
          item_id: 8,
          name: "Growth",
          type: "collection",
        }),
      ).toBe("/collection/8-growth");
    });

    it("returns data app bookmark path", () => {
      expect(
        bookmark({
          id: "collection-3",
          item_id: 3,
          name: "Shop",
          type: "collection",
          app_id: 14,
        }),
      ).toBe("/apps/14-shop");
    });
  });

  describe("extractEntityId", () => {
    const testCases = [
      { slug: "33", id: 33 },
      { slug: "33-", id: 33 },
      { slug: "33-metabase-ga", id: 33 },
      { slug: "330-pricing-v2-traction", id: 330 },
      { slug: "274-queries-run-in-the-last-24-weeks", id: 274 },
      { slug: "no-id-here", id: undefined },
      { slug: undefined, id: undefined },
    ];

    testCases.forEach(({ slug, id }) => {
      it(`should return "${id}" id if slug is "${slug}"`, () => {
        expect(extractEntityId(slug)).toBe(id);
      });
    });
  });

  describe("extractCollectionId", () => {
    const testCases = [
      { slug: "23", id: 23 },
      { slug: "23-", id: 23 },
      { slug: "23-customer-success", id: 23 },
      { slug: "root", id: "root" },
      { slug: "users", id: "users" },
      { slug: "no-id-here", id: undefined },
      { slug: undefined, id: undefined },
    ];

    testCases.forEach(({ slug, id }) => {
      it(`should return "${id}" id if slug is "${slug}"`, () => {
        expect(extractCollectionId(slug)).toBe(id);
      });
    });
  });

  describe("isCollectionPath", () => {
    const testCases = [
      { path: "collection/1", expected: true },
      { path: "collection/123", expected: true },
      { path: "/collection/1", expected: true },
      { path: "/collection/123", expected: true },
      { path: "/collection/1-stats", expected: true },
      { path: "/collection/123-stats-stats", expected: true },
      { path: "/collection/1-stats/new", expected: true },
      { path: "/collection/1-stats/nested/url", expected: true },
      { path: "/collection/1-stats/new_collection", expected: true },
      { path: "/collection/root", expected: true },
      { path: "/collection/users", expected: true },

      { path: "dashboard/1", expected: false },
      { path: "/dashboard/1", expected: false },
      { path: "/dashboard/12-orders", expected: false },
      { path: "/browse/1", expected: false },
      { path: "/browse/12-shop", expected: false },
      { path: "/question/1-orders", expected: false },
    ];

    testCases.forEach(({ path, expected }) => {
      it(`returns ${expected} for ${path}`, () => {
        expect(isCollectionPath(path)).toBe(expected);
      });
    });
  });

  describe("slug edge-cases", () => {
    const testCases = [
      {
        caseName: "numbers",
        input: "123 Orders 321",
        expectedString: "123-orders-321",
      },
      {
        caseName: "characters",
        input: "Also, lots | of 15% & $100 orders!",
        expectedString: "also-lots-of-15-100-orders",
      },
      {
        caseName: "quotes",
        input: `'Our' "Orders"`,
        expectedString: "our-orders",
      },
      {
        caseName: "brackets",
        input: `[Our] important (Orders)`,
        expectedString: "our-important-orders",
      },
      {
        caseName: "emoji",
        input: `Our Orders 🚚`,
        expectedString: "our-orders",
      },
      {
        caseName: "emoji only",
        input: `🚚 📦 🍰`,
        expectedString: "",
      },
      {
        caseName: "umlauts",
        input: `Über Aufträge`,
        expectedString: "uber-auftrage",
      },
      {
        caseName: "Danish",
        input: `æbleflæsk`,
        expectedString: "aebleflaesk",
      },
      {
        caseName: "French",
        input: `Déjà Vu`,
        expectedString: "deja-vu",
      },
      {
        caseName: "cyrillic",
        input: `Заказы`,
        expectedString: "zakazy",
      },
      // we don't transliterate languages below,
      // as their transliteration is usually too inaccurate
      {
        caseName: "Chinese",
        input: `命令`,
        expectedString: "",
      },
      {
        caseName: "Japanese",
        input: `注文`,
        expectedString: "",
      },
      {
        caseName: "Thai",
        input: `เชียงใหม่`,
        expectedString: "",
      },
    ];

    testCases.forEach(testCase => {
      const { caseName, input, expectedString } = testCase;
      const entity = { id: 1, name: input };

      function expectedUrl(path, slug) {
        // If slug is an empty string, we test we don't append `-` char
        return slug ? `${path}-${slug}` : path;
      }

      it(`should handle ${caseName} correctly for database browse URLs`, () => {
        expect(browseDatabase(entity)).toBe(
          expectedUrl("/browse/1", expectedString),
        );
      });

      it(`should handle ${caseName} correctly for collection URLs`, () => {
        // collection objects have not transliterated slugs separated by underscores
        // this makes sure they don't affect the slug builder
        const collectionOwnSlug = entity.name.split(" ").join("_");
        expect(collection({ ...entity, slug: collectionOwnSlug })).toBe(
          expectedUrl("/collection/1", expectedString),
        );
      });

      it(`should handle ${caseName} correctly for dashboard URLs`, () => {
        expect(dashboard(entity)).toBe(
          expectedUrl("/dashboard/1", expectedString),
        );
      });

      it(`should handle ${caseName} correctly for question URLs`, () => {
        expect(question(entity)).toBe(
          expectedUrl("/question/1", expectedString),
        );
      });
    });
  });
});
