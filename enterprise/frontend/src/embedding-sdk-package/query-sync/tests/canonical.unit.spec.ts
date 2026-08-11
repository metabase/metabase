import { canonicalJson, getQueryFingerprint } from "../canonical";

describe("query canonicalization", () => {
  it("uses a property-order-independent authored DSL fingerprint", () => {
    const first = getQueryFingerprint({
      source: { type: "table", id: 1 },
      limit: 5,
    });

    const second = getQueryFingerprint({
      limit: 5,
      source: { id: 2, type: "table" },
      savedQuestionSourceId: 99,
    });

    expect(first.hash).toBe(second.hash);
    expect(first.tableId).toBe(1);
    expect(second.tableId).toBe(2);

    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ ä: 2, z: 1 })).toBe('{"z":1,"ä":2}');
  });

  it("rejects non-serializable query definitions", () => {
    expect(() => canonicalJson({ value: undefined })).toThrow(
      "cannot contain undefined values",
    );
  });
});
