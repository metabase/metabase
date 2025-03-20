import {
  doesOperatorExist,
  getOperatorByTypeAndName,
  isEqualsOperator,
  isFuzzyOperator,
} from "metabase-lib/v1/operators/utils/index";
import {
  COORDINATE,
  FOREIGN_KEY,
  NUMBER,
  PRIMARY_KEY,
} from "metabase-lib/v1/types/constants";

describe("metabase-lib/v1/operators/utils", () => {
  describe("doesOperatorExist", () => {
    it("should return a boolean indicating existence of operator with given name", () => {
      expect(doesOperatorExist("foo")).toBe(false);
      expect(doesOperatorExist("contains")).toBe(true);
      expect(doesOperatorExist("between")).toBe(true);
    });
  });

  describe("isEqualsOperator", () => {
    it("should evaluate whether it is an equals operator", () => {
      expect(isEqualsOperator()).toBe(false);
      expect(isEqualsOperator({ name: "foo" })).toBe(false);
      expect(isEqualsOperator({ name: "=" })).toBe(true);
    });
  });

  describe("getOperatorByTypeAndName", () => {
    it("should return undefined if operator does not exist", () => {
      expect(getOperatorByTypeAndName("FOO", "=")).toBe(undefined);
      expect(getOperatorByTypeAndName(NUMBER, "contains")).toBe(undefined);
    });

    it("should return a metadata object for specific operator type/name", () => {
      expect(getOperatorByTypeAndName(NUMBER, "between")).toEqual({
        name: "between",
        numFields: 2,
        validArgumentsFilters: [expect.any(Function), expect.any(Function)],
        verboseName: "Between",
      });
    });

    it("should have 'between' filter operator for the coordinate type", () => {
      expect(getOperatorByTypeAndName(COORDINATE, "between")).toEqual({
        name: "between",
        numFields: 2,
        validArgumentsFilters: [expect.any(Function), expect.any(Function)],
        verboseName: "Between",
      });
    });

    it("should return a metadata object for primary key", () => {
      expect(getOperatorByTypeAndName(PRIMARY_KEY, "=")).toEqual({
        multi: true,
        name: "=",
        numFields: 1,
        validArgumentsFilters: [expect.any(Function)],
        verboseName: "Is",
      });
    });

    it("should return a metadata object for foreign key", () => {
      expect(getOperatorByTypeAndName(FOREIGN_KEY, "between")).toEqual({
        name: "between",
        numFields: 2,
        validArgumentsFilters: [expect.any(Function), expect.any(Function)],
        verboseName: "Between",
      });
    });
  });

  describe("isFuzzyOperator", () => {
    it("should return false for operators that expect an exact match", () => {
      expect(isFuzzyOperator({ name: "=" })).toBe(false);
      expect(isFuzzyOperator({ name: "!=" })).toBe(false);
    });

    it("should return true for operators that are not exact", () => {
      expect(isFuzzyOperator({ name: "contains" })).toBe(true);
      expect(isFuzzyOperator({ name: "between" })).toBe(true);
    });
  });
});
