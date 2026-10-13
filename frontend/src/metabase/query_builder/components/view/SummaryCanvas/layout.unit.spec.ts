import { getGrownLayout, getNextBlockLayout } from "./layout";
import type { SummaryBlockLayout } from "./types";

function createBlock(layout: SummaryBlockLayout) {
  return { layout };
}

const EMPTY_LAYOUT = { x: 0, y: 0, w: 0, h: 0 };
const NUMBER_BLOCK = { rows: [], columns: [], layout: EMPTY_LAYOUT };

describe("getNextBlockLayout", () => {
  it("places the first block at the top left with a default size", () => {
    expect(getNextBlockLayout([], NUMBER_BLOCK)).toEqual({
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    });
  });

  it("fills the space to the right before starting a new row", () => {
    const blocks = [createBlock({ x: 0, y: 0, w: 12, h: 4 })];

    expect(getNextBlockLayout(blocks, NUMBER_BLOCK)).toEqual({
      x: 12,
      y: 0,
      w: 6,
      h: 4,
    });
  });

  it("goes below when a row is full, keeping an existing size", () => {
    const blocks = [createBlock({ x: 0, y: 0, w: 24, h: 4 })];
    const sizedBlock = { ...NUMBER_BLOCK, layout: { x: 0, y: 0, w: 10, h: 5 } };

    expect(getNextBlockLayout(blocks, sizedBlock)).toEqual({
      x: 0,
      y: 4,
      w: 10,
      h: 5,
    });
  });
});

describe("getGrownLayout", () => {
  const CATEGORY = { rows: [{}], columns: [] };

  it("grows a number-sized block when it gains its first grouping", () => {
    const layout = { x: 20, y: 2, w: 4, h: 4 };

    expect(getGrownLayout(NUMBER_BLOCK, { ...CATEGORY, layout })).toEqual({
      x: 12,
      y: 2,
      w: 12,
      h: 8,
    });
  });

  it("keeps the user's size once the block is already grouped", () => {
    const layout = { x: 0, y: 0, w: 4, h: 4 };

    expect(getGrownLayout(CATEGORY, { ...CATEGORY, layout })).toEqual(layout);
  });
});
