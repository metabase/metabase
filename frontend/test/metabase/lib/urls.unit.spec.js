import {
  collection,
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
});
