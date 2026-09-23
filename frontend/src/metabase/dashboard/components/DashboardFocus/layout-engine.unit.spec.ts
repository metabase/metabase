import { classifyKind } from "./classify-kind";
import { type FocusCardInput, packLayout } from "./layout-engine";

const card = (
  over: Partial<FocusCardInput> & { id: number },
): FocusCardInput => ({
  kind: "comparison",
  score: 0.5,
  originalSize: { w: 12, h: 6 },
  ...over,
});

describe("classifyKind", () => {
  it("maps display types to kinds", () => {
    expect(classifyKind({ display: "scalar" })).toBe("callout");
    expect(classifyKind({ display: "smartscalar" })).toBe("callout");
    expect(classifyKind({ display: "line" })).toBe("trend");
    expect(classifyKind({ display: "bar" })).toBe("comparison");
    expect(classifyKind({ display: "pie" })).toBe("comparison");
    expect(classifyKind({ display: "text" })).toBe("text");
    expect(classifyKind({ display: "heading" })).toBe("text");
  });

  it("treats a one-row, few-column table as a callout, but a real table as a table", () => {
    expect(classifyKind({ display: "table", rowCount: 1, colCount: 1 })).toBe(
      "callout",
    );
    expect(classifyKind({ display: "table", rowCount: 198, colCount: 6 })).toBe(
      "table",
    );
  });

  it("falls back to 'other' for unknown displays", () => {
    expect(classifyKind({ display: "funky-new-viz" })).toBe("other");
    expect(classifyKind({ display: null })).toBe("other");
  });
});

describe("packLayout", () => {
  it("packs left-to-right and wraps to a new row when a card doesn't fit", () => {
    // Two 12-col comparison cards at score 0 (emphasis 0.8 → ~10 cols each) fit side by side; the third
    // wraps to a new row.
    const placed = packLayout([
      card({ id: 1, score: 0 }),
      card({ id: 2, score: 0 }),
      card({ id: 3, score: 0 }),
    ]);

    expect(placed[0].x).toBe(0);
    expect(placed[0].y).toBe(0);
    // Second card sits to the right of the first on the same row.
    expect(placed[1].x).toBe(placed[0].w);
    expect(placed[1].y).toBe(0);
    // Third card wraps: back to x=0 on a new row below.
    expect(placed[2].x).toBe(0);
    expect(placed[2].y).toBeGreaterThan(0);
  });

  it("never places a card past the right edge of the 24-col grid", () => {
    const placed = packLayout([
      card({ id: 1, kind: "trend", score: 1 }),
      card({ id: 2, kind: "trend", score: 1 }),
      card({ id: 3, kind: "callout", score: 0 }),
    ]);
    for (const p of placed) {
      expect(p.x + p.w).toBeLessThanOrEqual(24);
    }
  });

  it("gives higher-scored cards more area than lower-scored cards of the same kind", () => {
    const [hi, lo] = packLayout([
      card({ id: 1, kind: "comparison", score: 1 }),
      card({ id: 2, kind: "comparison", score: 0 }),
    ]);
    expect(hi.w * hi.h).toBeGreaterThan(lo.w * lo.h);
  });

  it("sizes table height by row count", () => {
    const [small, big] = packLayout([
      card({ id: 1, kind: "table", score: 0.5, rowCount: 3 }),
      card({ id: 2, kind: "table", score: 0.5, rowCount: 200 }),
    ]);
    expect(big.h).toBeGreaterThan(small.h);
  });

  it("packs callouts several across a single row", () => {
    const placed = packLayout([
      card({ id: 1, kind: "callout", score: 0.5 }),
      card({ id: 2, kind: "callout", score: 0.5 }),
      card({ id: 3, kind: "callout", score: 0.5 }),
    ]);
    // Three small callouts share the top row (all y=0).
    expect(placed.every((p) => p.y === 0)).toBe(true);
  });

  it("gives text cards the full grid width", () => {
    const [text] = packLayout([card({ id: 1, kind: "text", score: 0.5 })]);
    expect(text.w).toBe(24);
  });
});
