import type { FilterOperator } from "../../types";

import { findExactOperator, findOperators } from "./utils";

const IS: FilterOperator = { key: "=", label: "is", valueKind: "multi" };
const IS_NOT: FilterOperator = {
  key: "!=",
  label: "is not",
  valueKind: "multi",
};
const GREATER: FilterOperator = {
  key: ">",
  label: "greater than",
  valueKind: "single",
};
const AT_LEAST: FilterOperator = {
  key: ">=",
  label: "at least",
  valueKind: "single",
};
const OPERATORS = [IS, IS_NOT, GREATER, AT_LEAST];

describe("findOperators", () => {
  it("finds operators by label", () => {
    expect(findOperators(OPERATORS, "is")).toEqual([IS, IS_NOT]);
  });

  it("finds operators by symbol", () => {
    expect(findOperators(OPERATORS, ">")).toEqual([GREATER, AT_LEAST]);
  });
});

describe("findExactOperator", () => {
  it("picks a symbol even when it starts another one", () => {
    expect(findExactOperator(OPERATORS, ">")).toBe(GREATER);
  });

  it("picks a label that starts no other label", () => {
    expect(findExactOperator(OPERATORS, "is not")).toBe(IS_NOT);
  });

  it("does not pick a label that starts another one", () => {
    expect(findExactOperator(OPERATORS, "is")).toBeNull();
  });
});
