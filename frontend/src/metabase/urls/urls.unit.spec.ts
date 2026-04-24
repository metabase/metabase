import type { Bookmark, CollectionId } from "metabase-types/api";

import {
  bookmark,
  browseDatabase,
  card,
  collection,
  dashboard,
  extractCollectionId,
  extractEntityId,
  extractQueryParams,
  isCollectionPath,
  model,
  modelDetail,
  modelEditor,
} from ".";

describe("urls", () => {
  describe("question", () => {
    describe("with a query", () => {
      it("returns the correct url", () => {
        expect(card({}, { query: { foo: "bar" } })).toEqual(
          "/question?foo=bar",
        );
        expect(card(null, { query: { foo: "bar" } })).toEqual(
          "/question?foo=bar",
        );
        expect(card(null, { query: { foo: "bar+bar" } })).toEqual(
          "/question?foo=bar%2Bbar",
        );
        expect(card(null, { query: { foo: ["bar", "baz"] } })).toEqual(
          "/question?foo=bar&foo=baz",
        );
        expect(card(null, { query: { foo: ["bar", "baz+bay"] } })).toEqual(
          "/question?foo=bar&foo=baz%2Bbay",
        );
        expect(card(null, { query: { foo: ["bar", "baz&bay"] } })).toEqual(
          "/question?foo=bar&foo=baz%26bay",
        );
      });

      it("includes undefined params", () => {
        expect(card(null, { query: { foo: undefined } })).toEqual(
          "/question?foo=",
        );
        expect(card(null, { query: { foo: undefined, bar: "bar" } })).toEqual(
          "/question?foo=&bar=bar",
        );
      });

      it("includes null params", () => {
        expect(card(null, { query: { foo: null } })).toEqual("/question?foo=");
        expect(card(null, { query: { foo: undefined, bar: "bar" } })).toEqual(
          "/question?foo=&bar=bar",
        );
      });
    });

    describe("question ids", () => {
      it("returns the correct url", () => {
        expect(card(null)).toEqual("/question");
        expect(card({ id: 1 })).toEqual("/question/1");

        /**
         * If we're dealing with the question in a dashboard, we're reading the dashCard properties.
         * Make sure `card_id` gets assigned to the question url.
         */

        expect(card({ id: 1, card_id: 42, name: "Foo" })).toEqual(
          "/question/42-foo",
        );

        /** Symbol-based languages are unsupported. Such names result in the `name` being dropped.
         * Please see: https://github.com/metabase/metabase/pull/15989#pullrequestreview-656646149
         *
         * * We still have to make sure links to questions in a dashboard render correctly.
         */

        expect(card({ id: 1, card_id: 42 })).toEqual("/question/42");

        expect(card({ id: 1, card_id: 42, name: "ベーコン" })).toEqual(
          "/question/42",
        );
        expect(card({ id: 1, card_id: 42, name: "培根" })).toEqual(
          "/question/42",
        );
      });
    });

    describe("with object ID", () => {
      it("should append object ID to path", () => {
        const url = card({ id: 1 }, { objectId: 5 });
        expect(url).toBe("/question/1/5");
      });

      it("should support query params", () => {
        const url = card({ id: 1 }, { query: "?a=b", objectId: 5 });
        expect(url).toBe("/question/1/5?a=b");
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

  describe("model", () => {
    it("should return correct URL", () => {
      expect(model({ id: 1, type: "model", name: "Foo" })).toBe("/model/1-foo");
    });

    it("should prefer card_id when building a URL", () => {
      expect(model({ id: 1, card_id: 42, type: "model", name: "Foo" })).toBe(
        "/model/42-foo",
      );
    });

    it("should work with `model: dataset` property", () => {
      const card = {
        id: 1,
        card_id: 42,
        model: "dataset",
        name: "Foo",
      };
      expect(model(card)).toBe("/model/42-foo");
    });

    it("should handle object ID", () => {
      expect(
        model({ id: 1, type: "model", name: "Foo" }, { objectId: 4 }),
      ).toBe("/model/1-foo/4");
    });

    describe("detail page", () => {
      it("should return correct URL", () => {
        expect(modelDetail({ id: 1, type: "model", name: "Foo" })).toBe(
          "/model/1-foo/detail",
        );
      });
    });

    describe("editor", () => {
      it("should return correct query editor URL", () => {
        expect(modelEditor({ id: 1, name: "Order" }, { type: "query" })).toBe(
          "/model/1-order/query",
        );
      });

      it("should return query editor URL if `type` isn't provided explicitly", () => {
        expect(modelEditor({ id: 1, name: "Order" })).toBe(
          "/model/1-order/query",
        );
      });

      it("should return correct metadata editor URL", () => {
        expect(modelEditor({ id: 1, name: "Order" }, { type: "columns" })).toBe(
          "/model/1-order/columns",
        );
      });

      it("should handle missing name", () => {
        expect(modelEditor({ id: 1 })).toBe("/model/1/query");
      });

      it("should prefer card_id over id", () => {
        expect(modelEditor({ id: 1, card_id: 2 })).toBe("/model/2/query");
      });
    });
  });

  describe("collections", () => {
    it("returns root URL if collection is not passed", () => {
      expect(collection()).toBe("/collection/root");
    });

    it("resolves /root and /users collections", () => {
      expect(collection({ id: "root", name: "Root" })).toBe("/collection/root");
      expect(collection({ id: "users", name: "Users" })).toBe(
        "/collection/users",
      );
    });

    it("should treat `null` ID as a root collection", () => {
      const col = {
        id: null,
        name: "Root",
      };
      expect(collection(col)).toBe("/collection/root");
    });

    it("returns correct url", () => {
      expect(collection({ id: 1, name: "First collection" })).toBe(
        "/collection/1-first-collection",
      );
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
  });

  describe("bookmarks", () => {
    it("returns card bookmark path", () => {
      expect(
        bookmark({
          id: "card-5",
          card_type: "question",
          name: "Orders",
          type: "card",
        }),
      ).toBe("/question/5-orders");
    });

    it("returns model bookmark path", () => {
      expect(
        bookmark({
          id: "card-1",
          card_type: "model",
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
      const bm: Pick<Bookmark, "id" | "type" | "card_type" | "name"> = {
        id: "collection-8",
        name: "Growth",
        type: "collection",
      };
      expect(bookmark(bm)).toBe("/collection/8-growth");
    });
  });

  describe("extractEntityId", () => {
    const testCases: { slug: string | undefined; id: number | undefined }[] = [
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
    const testCases: {
      slug: string | undefined;
      id: CollectionId | undefined;
    }[] = [
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
    const testCases: { path: string; expected: boolean }[] = [
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
      { path: "/browse/databases/1", expected: false },
      { path: "/browse/databases/12-shop", expected: false },
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

    testCases.forEach((testCase) => {
      const { caseName, input, expectedString } = testCase;
      const entity = { id: 1, name: input };

      function expectedUrl(path: string, slug: string): string {
        // If slug is an empty string, we test we don't append `-` char
        return slug ? `${path}-${slug}` : path;
      }

      it(`should handle ${caseName} correctly for database browse URLs`, () => {
        expect(browseDatabase(entity)).toBe(
          expectedUrl("/browse/databases/1", expectedString),
        );
      });

      it(`should handle ${caseName} correctly for collection URLs`, () => {
        // collection objects have not transliterated slugs separated by underscores
        // this makes sure they don't affect the slug builder
        expect(collection({ id: entity.id, name: entity.name })).toBe(
          expectedUrl("/collection/1", expectedString),
        );
      });

      it(`should handle ${caseName} correctly for dashboard URLs`, () => {
        expect(dashboard(entity)).toBe(
          expectedUrl("/dashboard/1", expectedString),
        );
      });

      it(`should handle ${caseName} correctly for question URLs`, () => {
        expect(card(entity)).toBe(expectedUrl("/question/1", expectedString));
      });
    });
  });
});
