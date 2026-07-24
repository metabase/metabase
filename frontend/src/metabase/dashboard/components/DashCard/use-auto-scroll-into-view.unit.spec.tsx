import { act, renderHook } from "@testing-library/react";

import { useAutoScrollIntoView } from "./use-auto-scroll-into-view";

const BELOW_THE_FOLD = window.innerHeight + 200;

type SetupOpts = {
  enabled?: boolean;
  /**
   * The `top` the element reports after each scroll, mimicking a grid that
   * keeps moving its cards, or a scroll that never lands.
   */
  tops: number[];
};

function setup({ enabled = true, tops }: SetupOpts) {
  const frames: FrameRequestCallback[] = [];
  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => frames.push(callback));
  jest
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation(() => undefined);

  const scrollIntoView = jest.fn();
  let readCount = 0;
  // A stub rather than a real element: jsdom has no layout, so the position the
  // hook reads has to be scripted, one entry per scroll.
  const element = {
    scrollIntoView,
    getBoundingClientRect: () => ({
      top: tops[Math.min(readCount++, tops.length - 1)],
    }),
  } as unknown as HTMLElement;

  const ref = { current: element };
  const onScrolled = jest.fn();
  const { rerender } = renderHook(
    (props: { enabled: boolean }) =>
      useAutoScrollIntoView({ ref, onScrolled, ...props }),
    { initialProps: { enabled } },
  );

  const runFrames = (count: number) =>
    act(() => {
      for (let index = 0; index < count; index++) {
        const frame = frames.shift();
        if (!frame) {
          return;
        }
        frame(0);
      }
    });

  const setEnabled = (nextEnabled: boolean) =>
    rerender({ enabled: nextEnabled });

  return { scrollIntoView, onScrolled, runFrames, setEnabled };
}

describe("useAutoScrollIntoView", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does nothing when it is not the target dashcard", () => {
    const { scrollIntoView, onScrolled, runFrames } = setup({
      enabled: false,
      tops: [0],
    });

    runFrames(5);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(onScrolled).not.toHaveBeenCalled();
  });

  it("scrolls and reports right away, without waiting for a frame", () => {
    const { scrollIntoView, onScrolled } = setup({ tops: [BELOW_THE_FOLD] });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(onScrolled).toHaveBeenCalledTimes(1);
  });

  it("scrolls when an already mounted card becomes the target", () => {
    const { scrollIntoView, onScrolled, setEnabled } = setup({
      enabled: false,
      tops: [BELOW_THE_FOLD],
    });

    expect(scrollIntoView).not.toHaveBeenCalled();

    setEnabled(true);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(onScrolled).toHaveBeenCalledTimes(1);
  });

  it("keeps correcting the scroll after the card stops being the target", () => {
    const { scrollIntoView, setEnabled, runFrames } = setup({
      tops: [BELOW_THE_FOLD],
    });

    // Reporting the scroll clears the hash, which is what turns `enabled` off.
    setEnabled(false);
    runFrames(3);

    expect(scrollIntoView).toHaveBeenCalledTimes(4);
  });

  it("keeps scrolling while the grid is still moving the card", () => {
    const { scrollIntoView, runFrames } = setup({
      tops: [100, 240, 60, 0, 0, 0, 0, 0],
    });

    runFrames(6);
    expect(scrollIntoView).toHaveBeenCalledTimes(7);

    // The card stopped moving inside the viewport on the last three frames.
    runFrames(2);
    expect(scrollIntoView).toHaveBeenCalledTimes(7);
  });

  it("keeps scrolling while the card stays below the fold", () => {
    const { scrollIntoView, runFrames } = setup({ tops: [BELOW_THE_FOLD] });

    runFrames(10);

    expect(scrollIntoView).toHaveBeenCalledTimes(11);
  });

  it("gives up after a frame budget", () => {
    const { scrollIntoView, onScrolled, runFrames } = setup({
      tops: [BELOW_THE_FOLD],
    });

    runFrames(70);

    expect(scrollIntoView).toHaveBeenCalledTimes(61);
    expect(onScrolled).toHaveBeenCalledTimes(1);
  });
});
