import {
  createAdhocSourceId,
  createMeasureSourceId,
  createMetricSourceId,
  createSourceId,
  getSourceIcon,
  isAdhocSourceId,
  nextSyntheticCardId,
  parseSourceId,
} from "./source-ids";

describe("createMetricSourceId", () => {
  it("creates a metric source ID", () => {
    expect(createMetricSourceId(1)).toBe("metric:1");
    expect(createMetricSourceId(42)).toBe("metric:42");
  });
});

describe("createMeasureSourceId", () => {
  it("creates a measure source ID", () => {
    expect(createMeasureSourceId(5)).toBe("measure:5");
    expect(createMeasureSourceId(100)).toBe("measure:100");
  });
});

describe("createSourceId", () => {
  it("delegates to createMetricSourceId for metric type", () => {
    expect(createSourceId(1, "metric")).toBe("metric:1");
  });

  it("delegates to createMeasureSourceId for measure type", () => {
    expect(createSourceId(5, "measure")).toBe("measure:5");
  });
});

describe("createAdhocSourceId", () => {
  it("creates an adhoc source ID", () => {
    expect(createAdhocSourceId("abc-123")).toBe("adhoc:abc-123");
  });
});

describe("parseSourceId", () => {
  it("parses a metric source ID", () => {
    expect(parseSourceId("metric:1")).toEqual({ type: "metric", id: 1 });
  });

  it("parses a measure source ID", () => {
    expect(parseSourceId("measure:5")).toEqual({ type: "measure", id: 5 });
  });

  it("parses an adhoc source ID", () => {
    expect(parseSourceId("adhoc:abc-123" as any)).toEqual({
      type: "adhoc",
      uuid: "abc-123",
    });
  });
});

describe("getSourceIcon", () => {
  it('returns "metric" icon for metric source IDs', () => {
    expect(getSourceIcon("metric:1")).toBe("metric");
    expect(getSourceIcon("metric:99")).toBe("metric");
  });

  it('returns "ruler" icon for measure source IDs', () => {
    expect(getSourceIcon("measure:5")).toBe("ruler");
    expect(getSourceIcon("measure:42")).toBe("ruler");
  });

  it('returns "sum" icon for adhoc source IDs', () => {
    expect(getSourceIcon("adhoc:abc-123" as any)).toBe("sum");
  });
});

describe("isAdhocSourceId", () => {
  it("returns true for adhoc source IDs", () => {
    expect(isAdhocSourceId("adhoc:abc-123" as any)).toBe(true);
  });

  it("returns false for metric/measure source IDs", () => {
    expect(isAdhocSourceId("metric:1")).toBe(false);
    expect(isAdhocSourceId("measure:5")).toBe(false);
  });
});

describe("nextSyntheticCardId", () => {
  it("returns sequential negative IDs starting from -2", () => {
    expect(nextSyntheticCardId()).toBe(-2);
    expect(nextSyntheticCardId()).toBe(-3);
  });
});
