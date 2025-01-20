import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";

import {
  deriveFieldOperatorFromParameter,
  getOperatorDisplayName,
} from "./operators";

const option = {
  type: "foo",
  operator: "=",
  name: "foo",
};

describe("parameters/utils/operators", () => {
  describe("deriveFieldOperatorFromParameter", () => {
    describe("getOperatorDisplayName", () => {
      it("should return an option's section name when the operator is a date or a number", () => {
        expect(getOperatorDisplayName(option, "date", "bar")).toEqual("bar");
        expect(getOperatorDisplayName(option, "number", "bar")).toEqual("bar");
      });

      it("should return an option's section name for the string/= option", () => {
        expect(getOperatorDisplayName(option, "string", "bar")).toEqual("bar");
      });

      it("should otherwise return a combined sectionName + option name", () => {
        const option = {
          name: "Foo",
          operator: "!=",
          type: "foo",
        };
        expect(getOperatorDisplayName(option, "string", "Bar")).toEqual(
          "Bar foo",
        );
      });
    });

    describe("when parameter is associated with an operator", () => {
      it("should return relevant operator object", () => {
        const operator2 = deriveFieldOperatorFromParameter(
          createMockUiParameter({
            type: "string/contains",
          }),
        );
        const operator3 = deriveFieldOperatorFromParameter(
          createMockUiParameter({
            type: "number/between",
          }),
        );
        expect(operator2.name).toEqual("contains");
        expect(operator3.name).toEqual("between");
      });
    });

    describe("when parameter is location/category", () => {
      it("should map to an = operator", () => {
        expect(
          deriveFieldOperatorFromParameter(
            createMockUiParameter({
              type: "location/city",
            }),
          ).name,
        ).toBe("=");

        expect(
          deriveFieldOperatorFromParameter(
            createMockUiParameter({
              type: "category",
            }),
          ).name,
        ).toBe("=");
      });
    });

    describe("when parameter is NOT associated with an operator", () => {
      it("should return undefined", () => {
        expect(
          deriveFieldOperatorFromParameter(
            createMockUiParameter({ type: "date/single" }),
          ),
        ).toBe(undefined);
      });
    });
  });
});
