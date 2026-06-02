import type { FontStyle, TextWidthMeasurer } from "metabase/utils/measure-text";

import type { TreemapLayoutNode } from "./labels";
import { getTreemapLabelVisibility, shouldShowTreemapLabel } from "./labels";

describe("shouldShowTreemapLabel", () => {
  const fontSize = 12;
  // The label is inset from the tile's top-left by `padding` (matches the
  // option's `label.position`); we require the same breathing room on the
  // right and bottom.
  const padding = 12;

  it("shows the label when the text fits within the tile width and height", () => {
    expect(
      shouldShowTreemapLabel({
        rect: { width: 200, height: 80 },
        textWidth: 100,
        fontSize,
        padding,
      }),
    ).toBe(true);
  });

  it("hides the label when the text is wider than the available width", () => {
    // available width = 200 - 2*12 = 176; text is 180 → doesn't fit.
    expect(
      shouldShowTreemapLabel({
        rect: { width: 200, height: 80 },
        textWidth: 180,
        fontSize,
        padding,
      }),
    ).toBe(false);
  });

  it("hides the label in a tall, thin sliver even when it has plenty of area", () => {
    // A sliver: large area (40 * 300 = 12000) but only 40px wide — no room for
    // a horizontal label. This is the case the area-share proxy gets wrong.
    expect(
      shouldShowTreemapLabel({
        rect: { width: 40, height: 300 },
        textWidth: 100,
        fontSize,
        padding,
      }),
    ).toBe(false);
  });

  it("hides the label when the tile is too short to fit a line of text", () => {
    // available height = padding + fontSize = 24; height 20 is too short.
    expect(
      shouldShowTreemapLabel({
        rect: { width: 200, height: 20 },
        textWidth: 50,
        fontSize,
        padding,
      }),
    ).toBe(false);
  });

  it("shows the label when the text exactly fills the available width", () => {
    // available width = 200 - 2*12 = 176.
    expect(
      shouldShowTreemapLabel({
        rect: { width: 200, height: 80 },
        textWidth: 176,
        fontSize,
        padding,
      }),
    ).toBe(true);
  });

  it("hides the label for a zero-area tile", () => {
    expect(
      shouldShowTreemapLabel({
        rect: { width: 0, height: 0 },
        textWidth: 10,
        fontSize,
        padding,
      }),
    ).toBe(false);
  });
});

describe("getTreemapLabelVisibility", () => {
  const fontStyle: FontStyle = { size: 12, family: "Lato", weight: 700 };
  // Fake measurer: each character is 10px wide. Keeps the test independent of
  // canvas/DOM text metrics.
  const measureText: TextWidthMeasurer = (text) => text.length * 10;
  const config = { measureText, fontStyle, fontSize: 12, padding: 12 };

  function leaf(
    id: string,
    name: string,
    width: number,
    height: number,
  ): TreemapLayoutNode {
    return { id, name, rect: { width, height }, isLeaf: true };
  }

  it("returns one entry per leaf, keyed by node id", () => {
    const nodes = [
      leaf("0-0", "ab", 200, 80), // text 20px, fits
      leaf("0-1", "abcdefghij", 40, 300), // text 100px in a 40px-wide sliver
    ];
    expect(getTreemapLabelVisibility(nodes, config)).toEqual({
      "0-0": true,
      "0-1": false,
    });
  });

  it("ignores group nodes (which render a header chip, not a tile label)", () => {
    const nodes: TreemapLayoutNode[] = [
      { id: "0", name: "group", rect: { width: 300, height: 300 }, isLeaf: false },
      leaf("0-0", "ab", 200, 80),
    ];
    expect(getTreemapLabelVisibility(nodes, config)).toEqual({ "0-0": true });
  });

  it("returns an empty map when there are no nodes", () => {
    expect(getTreemapLabelVisibility([], config)).toEqual({});
  });
});
