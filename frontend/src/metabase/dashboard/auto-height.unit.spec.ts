import { applyAutoHeights } from "./auto-height";

describe("applyAutoHeights", () => {
  const layout = [
    { i: "1", x: 0, y: 0, w: 6, h: 8, minH: 4 },
    { i: "2", x: 0, y: 8, w: 6, h: 4 },
  ];

  it.each([6, 10])("rounds up to fit content with a %i px margin", (margin) => {
    const [card] = applyAutoHeights(layout, { "1": 301 }, 30, margin);
    expect(card.h * 30 + (card.h - 1) * margin).toBeGreaterThanOrEqual(301);
    expect((card.h - 1) * 30 + (card.h - 2) * margin).toBeLessThan(301);
  });

  it("shrinks below the saved minimum after rows are collapsed", () => {
    const expanded = applyAutoHeights(layout, { "1": 600 }, 30, 6);
    const collapsed = applyAutoHeights(expanded, { "1": 60 }, 30, 6);
    expect(collapsed[0].h).toBe(2);
    expect(collapsed[0].minH).toBe(1);
    expect(layout[0].h).toBe(8);
    expect(layout[0].minH).toBe(4);
    expect(collapsed[1]).toBe(layout[1]);
  });

  it.each([0, -1, NaN, Infinity])("ignores invalid height %s", (height) => {
    expect(applyAutoHeights(layout, { "1": height }, 30, 6)).toEqual(layout);
  });

  it("uses saved geometry when no measurements are supplied", () => {
    expect(applyAutoHeights(layout, {}, 30, 6)).toEqual(layout);
  });
});
