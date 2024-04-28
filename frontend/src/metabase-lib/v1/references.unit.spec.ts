import {
  isFieldReference,
  isExpressionReference,
  isAggregationReference,
  isTemplateTagReference,
  normalizeReferenceOptions,
} from "metabase-lib/v1/references";

describe("reference predicates", () => {
  describe("isFieldReference", () => {
    it("returns true for valid field references", () => {
      const validReferences = [
        ["field", 123, null],
        ["field", "column_name", null],
        ["field", "column_name", {}],
      ];

      validReferences.forEach(ref => expect(isFieldReference(ref)).toBe(true));
    });

    it("returns false for invalid field references", () => {
      const invalidReferences = [
        null,
        "field",
        ["field", 123],
        ["aggregation", 123, null],
        ["field", "column_name", null, { "source-field": true }],
      ];

      invalidReferences.forEach(ref =>
        expect(isFieldReference(ref)).toBe(false),
      );
    });
  });

  describe("isAggregationReference", () => {
    it("returns true for valid aggregation references", () => {
      const validReferences = [
        ["aggregation", 123, null],
        ["aggregation", "string", null],
        ["aggregation", "column_name", { "base-type": "number" }],
      ];

      validReferences.forEach(ref =>
        expect(isAggregationReference(ref)).toBe(true),
      );
    });

    it("returns false for invalid aggregation references", () => {
      const invalidReferences = [null, 123, "aggregation", ["field", 123]];

      invalidReferences.forEach(ref =>
        expect(isAggregationReference(ref)).toBe(false),
      );
    });
  });

  describe("isExpressionReference", () => {
    it("returns true for valid expression references", () => {
      const validReferences = [
        ["expression", "name"],
        ["expression", "string", null],
        ["expression", "column_name", { "base-type": "number" }],
      ];

      validReferences.forEach(ref =>
        expect(isExpressionReference(ref)).toBe(true),
      );
    });

    it("returns false for invalid expression references", () => {
      const invalidReferences = [
        null,
        123,
        "expression",
        ["expression"],
        ["field", 123],
      ];

      invalidReferences.forEach(ref =>
        expect(isExpressionReference(ref)).toBe(false),
      );
    });
  });

  describe("isTemplateTagReference", () => {
    it("returns true for valid template tag references", () => {
      const validReferences = [["template-tag", "tag name"]];

      validReferences.forEach(ref =>
        expect(isTemplateTagReference(ref)).toBe(true),
      );
    });

    it("returns false for invalid template tag references", () => {
      const invalidReferences = [null, "tag", ["templateTag", 123]];

      invalidReferences.forEach(ref =>
        expect(isTemplateTagReference(ref)).toBe(false),
      );
    });
  });
});

describe("normalizeReferenceOptions", () => {
  it("should remove empty options map", () => {
    expect(normalizeReferenceOptions(null)).toEqual(null);
    expect(normalizeReferenceOptions({})).toEqual(null);
  });
  it("should remove null/undefined keys", () => {
    expect(
      normalizeReferenceOptions({
        "temporal-unit": undefined,
        binning: { strategy: "default" },
        "base-type": undefined,
      }),
    ).toEqual({
      binning: { strategy: "default" },
    });
  });
  it("should recursively normalize maps options", () => {
    expect(
      normalizeReferenceOptions({
        binning: { strategy: "default", other: null } as any,
      }),
    ).toStrictEqual({
      binning: { strategy: "default" },
    });
  });
  // TODO -- it should also remove empty arrays, but we currently don't have any situations where there might be
  // one.
});
