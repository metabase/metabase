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
      refingerprint: null,
    });
    const currentValues = createMockDatabaseData({ refingerprint: false });

    expect(checkFormIsDirty(initialValues, currentValues)).toBe(false);
  });

  it("should treat null auto_run_queries as false", () => {
    const initialValues = createMockDatabaseData({
      auto_run_queries: null,
    });
    const currentValues = createMockDatabaseData({ auto_run_queries: false });

    expect(checkFormIsDirty(initialValues, currentValues)).toBe(false);
  });

  it("should treat a missing scan-only-used-field-values setting as false", () => {
    const currentValues = createMockDatabaseData({
      settings: { "scan-only-used-field-values": false },
    });

    expect(
      checkFormIsDirty(
        createMockDatabaseData({ settings: null }),
        currentValues,
      ),
    ).toBe(false);
    expect(
      checkFormIsDirty(createMockDatabaseData({ settings: {} }), currentValues),
    ).toBe(false);
    expect(checkFormIsDirty(createMockDatabaseData(), currentValues)).toBe(
      false,
    );
  });

  it("should be dirty when the scan-only-used-field-values setting changes", () => {
    const initialValues = createMockDatabaseData({ settings: null });
    const currentValues = createMockDatabaseData({
      settings: { "scan-only-used-field-values": true },
    });

    expect(checkFormIsDirty(initialValues, currentValues)).toBe(true);
  });
});
