import { question, extractQueryParams } from "metabase/lib/urls";

describe("urls", () => {
  describe("question", () => {
    describe("with a query", () => {
      it("returns the correct url", () => {
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
});
