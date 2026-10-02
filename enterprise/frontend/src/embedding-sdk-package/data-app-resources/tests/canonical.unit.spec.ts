import { canonicalJson } from "../canonical";

describe("query canonicalization", () => {
  it("serializes independent of property order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ ä: 2, z: 1 })).toBe('{"z":1,"ä":2}');
  });

  it("rejects non-serializable definitions", () => {
    expect(() => canonicalJson({ value: undefined })).toThrow(
      "cannot contain undefined values",
    );
  });

  it("rejects unsupported values", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(() => canonicalJson(circular)).toThrow("circular references");
    expect(() => canonicalJson({ value: new Date() })).toThrow(
      "only plain objects",
    );
    expect(() => canonicalJson({ value: Infinity })).toThrow(
      "non-finite numbers",
    );
  });
});
