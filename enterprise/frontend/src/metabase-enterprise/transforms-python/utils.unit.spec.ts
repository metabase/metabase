import type { PythonTransformSourceDraft } from "metabase-types/api";

import {
  canRunPythonTransformSource,
  getPythonSourceValidationResult,
} from "./utils";

const validSource: PythonTransformSourceDraft = {
  type: "python",
  body: "def transform(orders):\n    return orders",
  "source-database": 1,
  "source-tables": [{ alias: "orders", table_id: 10, database_id: 1 }],
};

describe("getPythonSourceValidationResult", () => {
  it("should accept a complete source", () => {
    expect(getPythonSourceValidationResult(validSource)).toEqual({
      isValid: true,
    });
  });

  it("should reject a source without a database", () => {
    expect(
      getPythonSourceValidationResult({
        ...validSource,
        "source-database": undefined,
      }),
    ).toEqual({ isValid: false, errorMessage: "Select a source database" });
  });

  it("should reject a source with a blank script", () => {
    expect(
      getPythonSourceValidationResult({ ...validSource, body: "  \n  " }),
    ).toEqual({
      isValid: false,
      errorMessage: "The Python script cannot be empty",
    });
  });

  it("should reject a source without tables", () => {
    expect(
      getPythonSourceValidationResult({ ...validSource, "source-tables": [] }),
    ).toEqual({
      isValid: false,
      errorMessage: "Select at least one table to alias",
    });
  });
});

describe("canRunPythonTransformSource", () => {
  it("should allow running a complete source", () => {
    expect(canRunPythonTransformSource(validSource)).toBe(true);
  });

  it("should not allow running without a database", () => {
    expect(
      canRunPythonTransformSource({
        ...validSource,
        "source-database": undefined,
      }),
    ).toBe(false);
  });

  it("should not allow running without tables", () => {
    expect(
      canRunPythonTransformSource({ ...validSource, "source-tables": [] }),
    ).toBe(false);
  });

  it("should not allow running a blank script", () => {
    expect(canRunPythonTransformSource({ ...validSource, body: " " })).toBe(
      false,
    );
  });
});
