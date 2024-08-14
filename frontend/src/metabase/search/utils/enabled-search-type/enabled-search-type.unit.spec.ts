import {
  filterEnabledSearchTypes,
  isEnabledSearchModelType,
} from "metabase/search/utils";

const TEST_VALID_VALUES = [
  "collection",
  "dashboard",
  "card",
  "database",
  "table",
  "dataset",
  "action",
];

const TEST_INVALID_VALUES = [null, undefined, 123, "invalid", [], {}];

describe("isEnabledSearchModelType", () => {
  it("should return true if value is in EnabledSearchModelType", () => {
    TEST_VALID_VALUES.forEach(value => {
      expect(isEnabledSearchModelType(value)).toBe(true);
    });
  });

  it("should return false if value is not in EnabledSearchModelType", () => {
    TEST_INVALID_VALUES.forEach(value => {
      expect(isEnabledSearchModelType(value)).toBe(false);
    });
  });
});

describe("filterEnabledSearchTypes", () => {
  it("should filter and return valid EnabledSearchModelTypes", () => {
    const inputValues = [...TEST_VALID_VALUES, ...TEST_INVALID_VALUES];

    const filteredValues = filterEnabledSearchTypes(inputValues);
    expect(filteredValues).toEqual(TEST_VALID_VALUES);
  });

  it("should return an empty array if no EnabledSearchModelType values found", () => {
    const filteredValues = filterEnabledSearchTypes(TEST_INVALID_VALUES);
    expect(filteredValues).toEqual([]);
  });

  it("should return an empty array when an empty input array is provided", () => {
    const inputValues: unknown[] = [];
    const filteredValues = filterEnabledSearchTypes(inputValues);
    expect(filteredValues).toEqual([]);
  });
});
