import {
  browseDatabase,
  collection,
  dashboard,
  question,
  extractQueryParams,
  extractEntityId,
  extractCollectionId,
} from "metabase/lib/urls";

describe("urls", () => {
  describe("question", () => {
    describe("with a query", () => {
      it("returns the correct url", () => {
        expect(question({}, "", { foo: "bar" })).toEqual("/question?foo=bar");
        expect(question({}, "hash", { foo: "bar" })).toEqual(
          "/question?foo=bar#hash",
        );
        expect(question(null, "hash", { foo: "bar" })).toEqual(
          "/question?foo=bar#hash",
        );
        expect(question(null, "", { foo: "bar" })).toEqual("/question?foo=bar");
        expect(question(null, "", { foo: "bar+bar" })).toEqual(
          "/question?foo=bar%2Bbar",
        );
        expect(question(null, "", { foo: ["bar", "baz"] })).toEqual(
          "/question?foo=bar&foo=baz",
        );
        expect(question(null, "", { foo: ["bar", "baz+bay"] })).toEqual(
          "/question?foo=bar&foo=baz%2Bbay",
        );
        expect(question(null, "", { foo: ["bar", "baz&bay"] })).toEqual(
          "/question?foo=bar&foo=baz%26bay",
        );
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
      expect(collection({ id: 1, slug: "first_collection" })).toBe(
        "/collection/1-first-collection",
      );

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

      it(`should handle ${caseName} correctly`, () => {
        expect(browseDatabase(entity)).toBe(
          expectedUrl("/browse/1", expectedString),
        );
        expect(collection(entity)).toBe(
          expectedUrl("/collection/1", expectedString),
        );
        expect(dashboard(entity)).toBe(
          expectedUrl("/dashboard/1", expectedString),
        );
        expect(question(entity)).toBe(
          expectedUrl("/question/1", expectedString),
        );
      });
    });
  });
});
