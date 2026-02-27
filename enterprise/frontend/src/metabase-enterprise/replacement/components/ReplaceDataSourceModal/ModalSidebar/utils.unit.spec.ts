import { createMockCheckReplaceSourceInfo } from "metabase-types/api/mocks";

import { getSourceError, getSubmitLabel, getTargetError } from "./utils";

describe("getSourceError", () => {
  it.each([
    {
      name: "dependentsCount is 0",
      checkInfo: undefined,
      dependentsCount: 0,
      expected: "Nothing uses this data source, so there's nothing to replace.",
    },
    {
      name: "checkInfo is undefined",
      checkInfo: undefined,
      dependentsCount: undefined,
      expected: undefined,
    },
    {
      name: "checkInfo is successful",
      checkInfo: createMockCheckReplaceSourceInfo({ success: true }),
      dependentsCount: 5,
      expected: undefined,
    },
    {
      name: "checkInfo has incompatible-implicit-joins error",
      checkInfo: createMockCheckReplaceSourceInfo({
        success: false,
        errors: ["incompatible-implicit-joins"],
      }),
      dependentsCount: 5,
      expected:
        "The original table can't be referenced by a foreign key by another table.",
    },
    {
      name: "checkInfo has no source-level errors",
      checkInfo: createMockCheckReplaceSourceInfo({
        success: false,
        errors: ["database-mismatch"],
      }),
      dependentsCount: 5,
      expected: undefined,
    },
  ])("$name", ({ checkInfo, dependentsCount, expected }) => {
    expect(getSourceError(checkInfo, dependentsCount)).toBe(expected);
  });
});

describe("getTargetError", () => {
  it.each([
    {
      name: "checkInfo is undefined",
      checkInfo: undefined,
      expected: undefined,
    },
    {
      name: "checkInfo is successful",
      checkInfo: createMockCheckReplaceSourceInfo({ success: true }),
      expected: undefined,
    },
    {
      name: "checkInfo has database-mismatch error",
      checkInfo: createMockCheckReplaceSourceInfo({
        success: false,
        errors: ["database-mismatch"],
      }),
      expected:
        "The replacement data source is in a different database than the original data source.",
    },
    {
      name: "checkInfo has cycle-detected error",
      checkInfo: createMockCheckReplaceSourceInfo({
        success: false,
        errors: ["cycle-detected"],
      }),
      expected:
        "The replacement data source can't be based on the original data source.",
    },
    {
      name: "checkInfo has only source-level error, no target error shown",
      checkInfo: createMockCheckReplaceSourceInfo({
        success: false,
        errors: ["incompatible-implicit-joins"],
      }),
      expected: undefined,
    },
    {
      name: "checkInfo has failure with no errors, returns generic message",
      checkInfo: createMockCheckReplaceSourceInfo({
        success: false,
        errors: [],
      }),
      expected: "This data source isn't compatible.",
    },
  ])("$name", ({ checkInfo, expected }) => {
    expect(getTargetError(checkInfo)).toBe(expected);
  });
});

describe("getSubmitLabel", () => {
  it.each([
    {
      name: "dependentsCount is undefined",
      dependentsCount: undefined,
      canReplace: true,
      expected: "Replace data source",
    },
    {
      name: "canReplace is false",
      dependentsCount: 5,
      canReplace: false,
      expected: "Replace data source",
    },
    {
      name: "1 item",
      dependentsCount: 1,
      canReplace: true,
      expected: "Replace data source in 1 items",
    },
    {
      name: "multiple items",
      dependentsCount: 5,
      canReplace: true,
      expected: "Replace data source in 5 items",
    },
  ])("$name", ({ dependentsCount, canReplace, expected }) => {
    expect(getSubmitLabel(dependentsCount, canReplace)).toBe(expected);
  });
});
