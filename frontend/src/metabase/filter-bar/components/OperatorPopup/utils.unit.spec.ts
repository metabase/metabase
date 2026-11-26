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
const IS_EMPTY: FilterOperator = {
  key: "is-empty",
  label: "is empty",
  valueKind: "none",
};
const OPERATORS = [IS, IS_NOT, GREATER, AT_LEAST, IS_EMPTY];

describe("findOperators", () => {
  it("finds operators by label", () => {
    expect(findOperators(OPERATORS, "is")).toEqual([IS, IS_NOT, IS_EMPTY]);
  });

  it("finds operators by symbol", () => {
    expect(findOperators(OPERATORS, ">")).toEqual([GREATER, AT_LEAST]);
  });

  it("does not search word keys as symbols", () => {
    expect(findOperators(OPERATORS, "-")).toEqual([]);
  });
});

describe("findExactOperator", () => {
  it.each<[string, FilterOperator]>([
    [">", GREATER],
    [" > ", GREATER],
    [">=", AT_LEAST],
    [" >= ", AT_LEAST],
  ])(
    "picks the symbol %j even when it starts another one",
    (query, operator) => {
      expect(findExactOperator(OPERATORS, query)).toBe(operator);
    },
  );

  it("does not pick a word key", () => {
    expect(findExactOperator(OPERATORS, "is-empty")).toBeNull();
  });

  it("picks a label that starts no other label", () => {
    expect(findExactOperator(OPERATORS, "is not")).toBe(IS_NOT);
  });

  it("does not pick a label that starts another one", () => {
    expect(findExactOperator(OPERATORS, "is")).toBeNull();
  });
});
