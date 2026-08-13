import {
  canonicalJson,
  getCanonicalQueryJson,
  getQueryFingerprint,
} from "../canonical";

import { setupQuerySyncTests } from "./setup";

describe("query canonicalization", () => {
  setupQuerySyncTests();

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

  it("rejects unsupported values and invalid table sources", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(() => canonicalJson(circular)).toThrow("circular references");
    expect(() => canonicalJson({ value: new Date() })).toThrow(
      "only plain objects",
    );
    expect(() => canonicalJson({ value: Infinity })).toThrow(
      "non-finite numbers",
    );
    expect(() => getQueryFingerprint({})).toThrow("valid table source");
    expect(() =>
      getQueryFingerprint({ source: { type: "table", id: 0 } }),
    ).toThrow("valid table source");
  });

  it("preserves references while normalizing generated query IDs", () => {
    const queryWithGeneratedIds = (
      firstId: string,
      secondId: string,
      orderById: string,
    ) => ({
      stages: [
        {
          aggregation: [
            ["sum", { "lib/uuid": firstId }, ["field", {}, 1]],
            ["sum", { "lib/uuid": secondId }, ["field", {}, 2]],
          ],
          "order-by": [["desc", {}, ["aggregation", {}, orderById]]],
        },
      ],
    });
    const normalized = (value: unknown) => getCanonicalQueryJson(value);
    const first = queryWithGeneratedIds("first-a", "second-a", "second-a");
    const same = queryWithGeneratedIds("first-b", "second-b", "second-b");
    const different = queryWithGeneratedIds("first-c", "second-c", "first-c");

    expect(normalized(first)).toBe(normalized(same));
    expect(normalized(first)).not.toBe(normalized(different));
  });
});
