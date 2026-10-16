import type { FloatingPosition } from "@mantine/core";
import { act, renderHook } from "@testing-library/react";

import { useStablePopoverPosition } from "./use-stable-popover-position";

type Result = ReturnType<typeof useStablePopoverPosition>;

function getSizeApply({ middlewares }: Result) {
  const size = middlewares.size;
  if (typeof size !== "object" || size.apply == null) {
    throw new Error("Expected the size middleware to have an apply callback");
  }
  return size.apply;
}

type SizeApplyArgs = Parameters<ReturnType<typeof getSizeApply>>[0];

function applyPlacement(
  result: { current: Result },
  placement: FloatingPosition,
  { floatingHeight = 200 } = {},
) {
  const floating = document.createElement("div");
  const reference = document.createElement("div");
  const state: Omit<SizeApplyArgs, "platform"> = {
    placement,
    initialPlacement: placement,
    strategy: "absolute",
    x: 0,
    y: 0,
    middlewareData: {},
    rects: {
      reference: { x: 0, y: 0, width: 100, height: 30 },
      floating: { x: 0, y: 0, width: 100, height: floatingHeight },
    },
    elements: { reference, floating },
    availableWidth: 300,
    availableHeight: 400,
  };
  // floating-ui's `platform` isn't used by the hook, so it's left out
  const args = state as SizeApplyArgs;
  act(() => {
    getSizeApply(result.current)(args);
  });
  return floating;
}

function setup() {
  return renderHook(() => useStablePopoverPosition("bottom-start")).result;
}

describe("useStablePopoverPosition", () => {
  it("lets the popover flip until it has been placed", () => {
    const result = setup();

    expect(result.current.position).toBe("bottom-start");
    expect(result.current.middlewares.flip).toBe(true);
  });

  it("keeps the side the popover was first placed on", () => {
    const result = setup();

    applyPlacement(result, "top-start");
    applyPlacement(result, "bottom-start");

    expect(result.current.position).toBe("top-start");
    expect(result.current.middlewares.flip).toBe(false);
  });

  it("still limits the popover to the available space", () => {
    const result = setup();

    const floating = applyPlacement(result, "top-start");

    expect(floating).toHaveStyle({ maxWidth: "300px", maxHeight: "400px" });
  });

  it("picks the side again after the popover closes", () => {
    const result = setup();

    applyPlacement(result, "top-start");
    act(() => result.current.onClose());

    expect(result.current.position).toBe("bottom-start");
    expect(result.current.middlewares.flip).toBe(true);
  });

  it("ignores updates while the dropdown is hidden", () => {
    const result = setup();

    applyPlacement(result, "top-start", { floatingHeight: 0 });

    expect(result.current.position).toBe("bottom-start");
    expect(result.current.middlewares.flip).toBe(true);
  });
});
