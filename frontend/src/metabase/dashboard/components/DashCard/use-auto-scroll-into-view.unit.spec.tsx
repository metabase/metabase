import { act, renderHook } from "@testing-library/react";

import { useAutoScrollIntoView } from "./use-auto-scroll-into-view";

function setup({ enabled = true }: { enabled?: boolean } = {}) {
  const frames: FrameRequestCallback[] = [];
  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => frames.push(callback));
  jest
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation(() => undefined);

  const scrollIntoView = jest.fn();
  // A stub rather than a real element: jsdom has no layout.
  const ref = { current: { scrollIntoView } as unknown as HTMLElement };

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
    const { scrollIntoView, onScrolled, runFrames } = setup({ enabled: false });

    runFrames(5);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(onScrolled).not.toHaveBeenCalled();
  });

  it("scrolls and reports right away, without waiting for a frame", () => {
    const { scrollIntoView, onScrolled } = setup();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(onScrolled).toHaveBeenCalledTimes(1);
  });

  it("scrolls when an already mounted card becomes the target", () => {
    const { scrollIntoView, onScrolled, setEnabled } = setup({
      enabled: false,
    });

    setEnabled(true);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(onScrolled).toHaveBeenCalledTimes(1);
  });

  it("keeps correcting the scroll while the grid lays itself out, then stops", () => {
    const { scrollIntoView, setEnabled, runFrames } = setup();

    // Reporting the scroll clears the hash, which is what turns `enabled` off.
    setEnabled(false);

    runFrames(30);

    expect(scrollIntoView).toHaveBeenCalledTimes(20);
  });
});
