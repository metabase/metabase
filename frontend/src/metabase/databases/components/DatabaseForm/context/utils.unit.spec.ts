import { createMockDatabaseData } from "metabase-types/api/mocks";

import { checkFormIsDirty } from "./utils";

describe("checkFormIsDirty", () => {
  it("should return false when values are equal", () => {
    const initialValues = createMockDatabaseData();
    const currentValues = createMockDatabaseData();

    // Everything is the same
    expect(checkFormIsDirty(initialValues, currentValues)).toBe(false);

    // Name changed
    expect(
      checkFormIsDirty(initialValues, {
        ...currentValues,
        name: "another name",
      }),
    ).toBe(true);
  });

  it("should ignore advanced-options field when checking dirty state", () => {
    const initialValues = createMockDatabaseData({
      details: {
        "advanced-options": false,
      },
    });
    const currentValues = createMockDatabaseData({
      details: {
        "advanced-options": true,
      },
    });

    expect(checkFormIsDirty(initialValues, currentValues)).toBe(false);
  });

  it("should treat null refingerprint as false", () => {
    const initialValues = createMockDatabaseData({
      refingerprint: null as any,
    });
    const currentValues = createMockDatabaseData({ refingerprint: false });

    expect(checkFormIsDirty(initialValues, currentValues)).toBe(false);
  });

  it("should treat null auto_run_queries as false", () => {
    const initialValues = createMockDatabaseData({
      auto_run_queries: null as any,
    });
    const currentValues = createMockDatabaseData({ auto_run_queries: false });

    expect(checkFormIsDirty(initialValues, currentValues)).toBe(false);
  });
});
