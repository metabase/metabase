import {
  getOperatorDisplayName,
  deriveFieldOperatorFromParameter,
} from "./operators";

describe("parameters/utils/operators", () => {
  describe("deriveFieldOperatorFromParameter", () => {
    describe("getOperatorDisplayName", () => {
      it("should return an option's name when the operator is a date or a number", () => {
        expect(getOperatorDisplayName({ name: "foo" }, "date")).toEqual("foo");
        expect(getOperatorDisplayName({ name: "foo" }, "number")).toEqual(
          "foo",
        );
      });

      it("should return an option's section name for the string/= option", () => {
        expect(
          getOperatorDisplayName(
            { name: "foo", operator: "=" },
            "string",
            "bar",
          ),
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

    describe("when parameter is associated with an operator", () => {
      it("should return relevant operator object", () => {
        const operator2 = deriveFieldOperatorFromParameter({
          type: "string/contains",
        });
        const operator3 = deriveFieldOperatorFromParameter({
          type: "number/between",
        });
        expect(operator2.name).toEqual("contains");
        expect(operator3.name).toEqual("between");
      });
    });

    describe("when parameter is location/category", () => {
      it("should map to an = operator", () => {
        expect(
          deriveFieldOperatorFromParameter({
            type: "location/city",
          }).name,
        ).toBe("=");

        expect(
          deriveFieldOperatorFromParameter({
            type: "category",
          }).name,
        ).toBe("=");
      });
    });

    describe("when parameter is NOT associated with an operator", () => {
      it("should return undefined", () => {
        expect(deriveFieldOperatorFromParameter({ type: "date/single" })).toBe(
          undefined,
        );
      });
    });
  });
});
