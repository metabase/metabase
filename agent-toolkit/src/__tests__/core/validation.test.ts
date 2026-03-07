import { describe, it, expect } from "vitest";
import {
  validatePositiveInt,
  sanitizeString,
  validateEnum,
  CliError,
} from "../../core/validation.js";

describe("validatePositiveInt", () => {
  it("accepts positive integers", () => {
    expect(validatePositiveInt(1, "id")).toBe(1);
    expect(validatePositiveInt(42, "id")).toBe(42);
  });

  it("parses string integers", () => {
    expect(validatePositiveInt("5", "id")).toBe(5);
    expect(validatePositiveInt("100", "id")).toBe(100);
  });

  it("rejects zero", () => {
    expect(() => validatePositiveInt(0, "id")).toThrow(CliError);
  });

  it("rejects negative numbers", () => {
    expect(() => validatePositiveInt(-1, "id")).toThrow(CliError);
  });

  it("rejects non-integers", () => {
    expect(() => validatePositiveInt(1.5, "id")).toThrow(CliError);
    expect(() => validatePositiveInt("abc", "id")).toThrow(CliError);
  });
});

describe("sanitizeString", () => {
  it("allows normal strings", () => {
    expect(sanitizeString("hello world")).toBe("hello world");
  });

  it("allows newlines and tabs", () => {
    expect(sanitizeString("line1\nline2\ttab")).toBe("line1\nline2\ttab");
  });

  it("rejects control characters", () => {
    expect(() => sanitizeString("hello\x00world")).toThrow(CliError);
    expect(() => sanitizeString("test\x07")).toThrow(CliError);
  });
});

describe("validateEnum", () => {
  const allowed = ["a", "b", "c"] as const;

  it("accepts valid values", () => {
    expect(validateEnum("a", allowed, "test")).toBe("a");
    expect(validateEnum("c", allowed, "test")).toBe("c");
  });

  it("rejects invalid values", () => {
    expect(() => validateEnum("d", allowed, "test")).toThrow(CliError);
  });
});

describe("CliError", () => {
  it("serializes to JSON with code and message", () => {
    const err = new CliError("test_error", { message: "Something broke" });
    expect(err.toJSON()).toEqual({
      error: "test_error",
      message: "Something broke",
    });
  });

  it("includes hint when provided", () => {
    const err = new CliError("test_error", {
      message: "Not found",
      hint: "Try this instead",
    });
    expect(err.toJSON()).toEqual({
      error: "test_error",
      message: "Not found",
      hint: "Try this instead",
    });
  });

  it("spreads details into JSON", () => {
    const err = new CliError("test_error", {
      message: "Not found",
      details: { available_fields: ["a", "b"] },
    });
    const json = err.toJSON();
    expect(json.available_fields).toEqual(["a", "b"]);
  });
});
