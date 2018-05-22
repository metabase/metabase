import { question } from "metabase/lib/urls";

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
});
