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
  const byId = (placed: ReturnType<typeof packLayout>, id: number) => {
    const p = placed.find((c) => c.id === id);
    if (!p) {
      throw new Error(`no placement for card ${id}`);
    }
    return p;
  };

  it("leaves no vertical holes: every card on a shelf shares the same height", () => {
    // The bug in the screenshots: a short callout beside a tall table left the rest of the column empty.
    // Banding fixes it — a table row and a callout row never share a shelf, and same-kind rows are flush.
    const placed = packLayout([
      card({ id: 1, kind: "table", score: 0.9, rowCount: 26 }),
      card({ id: 2, kind: "callout", score: 0.8 }),
      card({ id: 3, kind: "table", score: 0.5, rowCount: 4 }),
      card({ id: 4, kind: "callout", score: 0.4 }),
    ]);
    // Cards sharing a y (a shelf) must share an h.
    const byRow = new Map<number, number[]>();
    for (const p of placed) {
      const hs = byRow.get(p.y) ?? [];
      hs.push(p.h);
      byRow.set(p.y, hs);
    }
    for (const hs of byRow.values()) {
      expect(new Set(hs).size).toBe(1);
    }
  });

  it("stacks kinds in bands: callouts above tables", () => {
    const placed = packLayout([
      card({ id: 1, kind: "table", score: 0.9, rowCount: 26 }),
      card({ id: 2, kind: "callout", score: 0.2 }),
    ]);
    // Even though the table scores higher, callouts band sits above the table band.
    expect(byId(placed, 2).y).toBeLessThan(byId(placed, 1).y);
  });

  it("never places a card past the right edge of the 24-col grid", () => {
    const placed = packLayout([
      card({ id: 1, kind: "trend", score: 1 }),
      card({ id: 2, kind: "trend", score: 1 }),
      card({ id: 3, kind: "callout", score: 0 }),
      card({ id: 4, kind: "comparison", score: 0.5 }),
      card({ id: 5, kind: "table", score: 0.5, rowCount: 50 }),
    ]);
    for (const p of placed) {
      expect(p.x + p.w).toBeLessThanOrEqual(24);
    }
  });

  it("orders cards within a band by relevance (most relevant first)", () => {
    const placed = packLayout([
      card({ id: 1, kind: "callout", score: 0.1 }),
      card({ id: 2, kind: "callout", score: 0.9 }),
    ]);
    // Higher score gets the left/earlier slot on the shelf.
    expect(byId(placed, 2).x).toBeLessThan(byId(placed, 1).x);
  });

  it("packs callouts four across a single shelf", () => {
    const placed = packLayout([
      card({ id: 1, kind: "callout", score: 0.5 }),
      card({ id: 2, kind: "callout", score: 0.5 }),
      card({ id: 3, kind: "callout", score: 0.5 }),
      card({ id: 4, kind: "callout", score: 0.5 }),
    ]);
    // All four callouts share the top shelf (y=0), left-to-right.
    expect(placed.every((p) => p.y === 0)).toBe(true);
    expect(new Set(placed.map((p) => p.x)).size).toBe(4);
  });

  it("packs comparisons two across", () => {
    const placed = packLayout([
      card({ id: 1, kind: "comparison", score: 0.5 }),
      card({ id: 2, kind: "comparison", score: 0.5 }),
      card({ id: 3, kind: "comparison", score: 0.5 }),
    ]);
    // Two on the first shelf, one wraps below.
    expect(byId(placed, 1).y).toBe(byId(placed, 2).y);
    expect(byId(placed, 3).y).toBeGreaterThan(byId(placed, 1).y);
  });

  it("sizes table shelf height by the tallest table's row count", () => {
    const small = packLayout([
      card({ id: 1, kind: "table", score: 0.5, rowCount: 3 }),
    ]);
    const big = packLayout([
      card({ id: 1, kind: "table", score: 0.5, rowCount: 200 }),
    ]);
    expect(byId(big, 1).h).toBeGreaterThan(byId(small, 1).h);
  });

  it("gives text cards the full grid width", () => {
    const placed = packLayout([card({ id: 1, kind: "text", score: 0.5 })]);
    expect(byId(placed, 1).w).toBe(24);
  });

  it("boots demoted (not-focused) cards below all focused cards", () => {
    // The screenshot bug: a dimmed callout sat as an equal beside the focused one because scores clustered.
    // With an explicit focused flag, demoted cards drop below the whole focused zone regardless of score.
    const placed = packLayout([
      card({ id: 1, kind: "callout", score: 0.31, focused: true }),
      card({ id: 2, kind: "callout", score: 0.3, focused: false }),
      card({ id: 3, kind: "trend", score: 0.29, focused: true }),
    ]);
    const demoted = byId(placed, 2);
    const focusedCards = [byId(placed, 1), byId(placed, 3)];
    for (const f of focusedCards) {
      expect(demoted.y).toBeGreaterThanOrEqual(f.y + f.h);
    }
  });

  it("shrinks demoted cards relative to the same card focused", () => {
    const focused = byId(
      packLayout([
        card({ id: 1, kind: "comparison", score: 0.5, focused: true }),
      ]),
      1,
    );
    const demoted = byId(
      packLayout([
        card({ id: 1, kind: "comparison", score: 0.5, focused: false }),
      ]),
      1,
    );
    expect(demoted.h).toBeLessThan(focused.h);
  });
});
