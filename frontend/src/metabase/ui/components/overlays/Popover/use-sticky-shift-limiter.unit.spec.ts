import type { Placement } from "@floating-ui/dom";

import {
  type StickyShiftLimiter,
  createStickyShiftLimiter,
} from "./use-sticky-shift-limiter";

type MiddlewareState = Parameters<StickyShiftLimiter["fn"]>[0];

const ANCHOR_SIZE = 24;

interface StateOpts {
  anchor: HTMLElement;
  dropdown: HTMLElement;
  anchorTop: number;
  dropdownHeight: number;
  // Where `shift` puts the dropdown top before the limiter runs
  shiftedTop: number;
  placement?: Placement;
}

const createState = ({
  anchor,
  dropdown,
  anchorTop,
  dropdownHeight,
  shiftedTop,
  placement = "right-start",
}: StateOpts): MiddlewareState => ({
  x: 334,
  y: shiftedTop,
  placement,
  initialPlacement: placement,
  strategy: "absolute",
  middlewareData: {},
  rects: {
    reference: {
      x: 300,
      y: anchorTop,
      width: ANCHOR_SIZE,
      height: ANCHOR_SIZE,
    },
    floating: { x: 0, y: 0, width: 336, height: dropdownHeight },
  },
  elements: { reference: anchor, floating: dropdown },
  platform: {
    getElementRects: () => ({
      reference: { x: 0, y: 0, width: 0, height: 0 },
      floating: { x: 0, y: 0, width: 0, height: 0 },
    }),
    getClippingRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    getDimensions: () => ({ width: 0, height: 0 }),
  },
});

const setup = () => {
  const limiter = createStickyShiftLimiter();
  const anchor = document.createElement("button");
  const dropdown = document.createElement("div");
  const getTop = (opts: Partial<StateOpts> & Pick<StateOpts, "shiftedTop">) =>
    limiter.fn(
      createState({
        anchor,
        dropdown,
        anchorTop: 500,
        dropdownHeight: 300,
        ...opts,
      }),
    ).y;

  // Viewport 600 px high, shift padding 16: a 500 px dropdown next to an
  // anchor at 500 doesn't fit below it, so `shift` moves it up to 84
  const initialTop = getTop({ dropdownHeight: 500, shiftedTop: 84 });

  return { limiter, getTop, initialTop };
};

describe("createStickyShiftLimiter", () => {
  it("should keep the dropdown top when the dropdown gets shorter or taller (metabase#85020)", () => {
    const { getTop, initialTop } = setup();

    expect(initialTop).toBe(84);
    expect(getTop({ dropdownHeight: 300, shiftedTop: 284 })).toBe(84);
    expect(getTop({ dropdownHeight: 500, shiftedTop: 84 })).toBe(84);
  });

  it("should move the dropdown up when it would overflow the viewport (metabase#85020)", () => {
    const { getTop } = setup();

    expect(getTop({ dropdownHeight: 560, shiftedTop: 24 })).toBe(24);
    expect(getTop({ dropdownHeight: 300, shiftedTop: 284 })).toBe(24);
  });

  it("should place a new dropdown next to its anchor", () => {
    const { getTop } = setup();

    expect(
      getTop({
        dropdown: document.createElement("div"),
        dropdownHeight: 300,
        shiftedTop: 284,
      }),
    ).toBe(284);
  });

  it("should place the dropdown next to a new anchor", () => {
    const { getTop } = setup();

    expect(
      getTop({
        anchor: document.createElement("button"),
        dropdownHeight: 300,
        shiftedTop: 284,
      }),
    ).toBe(284);
  });

  it("should place the dropdown next to its anchor when the anchor moves", () => {
    const { getTop } = setup();

    expect(
      getTop({ anchorTop: 400, dropdownHeight: 300, shiftedTop: 284 }),
    ).toBe(284);
  });

  it("should place the dropdown next to its anchor after a reset", () => {
    const { limiter, getTop } = setup();

    limiter.reset();

    expect(getTop({ dropdownHeight: 300, shiftedTop: 284 })).toBe(284);
  });

  it("should not keep the dropdown top for a placement that is not *-start", () => {
    const { getTop } = setup();

    expect(
      getTop({ dropdownHeight: 300, shiftedTop: 284, placement: "right" }),
    ).toBe(284);
  });

  it("should keep the left edge for a dropdown above or below its anchor", () => {
    const limiter = createStickyShiftLimiter();
    const anchor = document.createElement("button");
    const dropdown = document.createElement("div");
    const getLeft = (shiftedLeft: number) =>
      limiter.fn({
        ...createState({
          anchor,
          dropdown,
          anchorTop: 500,
          dropdownHeight: 300,
          shiftedTop: 524,
          placement: "bottom-start",
        }),
        x: shiftedLeft,
      }).x;

    expect(getLeft(250)).toBe(250);
    expect(getLeft(300)).toBe(250);
  });
});
