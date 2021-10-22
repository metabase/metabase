import { getOperatorDisplayName } from "./internal";

describe("parameters/utils/internal", () => {
  describe("getOperatorDisplayName", () => {
    it("should return an option's name when the operator is a date or a number", () => {
      expect(getOperatorDisplayName({ name: "foo" }, "date")).toEqual("foo");
      expect(getOperatorDisplayName({ name: "foo" }, "number")).toEqual("foo");
    });

    it("should return an option's section name for the string/= option", () => {
      expect(
        getOperatorDisplayName({ name: "foo", operator: "=" }, "string", "bar"),
      ).toEqual("bar");
    });

    it("should otherwise return a combined sectionName + option name", () => {
      expect(
        getOperatorDisplayName(
          { name: "Foo", operator: "!=" },
          "string",
          "Bar",
        ),
      ).toEqual("Bar foo");
    });
  });
});
