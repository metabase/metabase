import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { act, fireEvent, render, screen, waitFor } from "__support__/ui";

import { Tooltip, TooltipPortalTargetProvider } from "./Tooltip";

// Well past the close delay and the fade-out, so a tooltip that's going to
// close has gone.
const LONGER_THAN_CLOSE_MS = 1000;

const setupUser = () =>
  userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

const FADE_DURATION_MS = 200;

const setup = () => {
  const user = setupUser();
  render(
    <Tooltip
      label="Tooltip content"
      transitionProps={{ duration: FADE_DURATION_MS }}
    >
      <button>Target</button>
    </Tooltip>,
  );
  return { user };
};

const ISOLATED_EVENTS = [
  { type: "click", fire: fireEvent.click },
  { type: "dblclick", fire: fireEvent.dblClick },
  { type: "contextmenu", fire: fireEvent.contextMenu },
  { type: "mousedown", fire: fireEvent.mouseDown },
  { type: "mouseup", fire: fireEvent.mouseUp },
  { type: "pointerdown", fire: fireEvent.pointerDown },
  { type: "pointerup", fire: fireEvent.pointerUp },
  { type: "touchstart", fire: fireEvent.touchStart },
];

const setupEventIsolation = () => {
  const onParentEvent = jest.fn<void, [string]>();
  const recordType = (event: { type: string }) => onParentEvent(event.type);

  render(
    <div
      onClick={recordType}
      onDoubleClick={recordType}
      onContextMenu={recordType}
      onMouseDown={recordType}
      onMouseUp={recordType}
      onPointerDown={recordType}
      onPointerUp={recordType}
      onTouchStart={recordType}
    >
      <Tooltip label="Tooltip content" opened>
        <button>Target</button>
      </Tooltip>
    </div>,
  );

  return { onParentEvent };
};

describe("Tooltip", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("stays open while the pointer is over the tooltip and closes when it leaves", async () => {
    const { user } = setup();
    const target = screen.getByRole("button", { name: "Target" });

    await user.hover(target);
    const tooltip = await screen.findByRole("tooltip");
    await waitFor(() => expect(tooltip).toHaveAttribute("data-hoverable"));

    await user.unhover(target);
    await user.hover(tooltip);
    act(() => jest.advanceTimersByTime(LONGER_THAN_CLOSE_MS));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await user.unhover(tooltip);
    // While it fades out, it lets the pointer through to what's underneath.
    await waitFor(() => {
      expect(tooltip).not.toHaveAttribute("data-hoverable");
    });
    expect(tooltip).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  it("closes when the pointer leaves the target without moving onto the tooltip", async () => {
    const { user } = setup();
    const target = screen.getByRole("button", { name: "Target" });

    await user.hover(target);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    await user.unhover(target);
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  it.each(ISOLATED_EVENTS)(
    "lets $type on the target reach its parents",
    async ({ type, fire }) => {
      const { onParentEvent } = setupEventIsolation();
      await screen.findByRole("tooltip");

      fire(screen.getByRole("button", { name: "Target" }));
      expect(onParentEvent).toHaveBeenCalledWith(type);
    },
  );

  it.each(ISOLATED_EVENTS)(
    "keeps $type on the tooltip from reaching the target's parents",
    async ({ type, fire }) => {
      const { onParentEvent } = setupEventIsolation();
      const tooltip = await screen.findByRole("tooltip");

      fire(screen.getByText("Tooltip content"));
      fire(tooltip);
      expect(onParentEvent).not.toHaveBeenCalledWith(type);
    },
  );

  it("still stops events on the tooltip reaching the target's parents when the caller handles them", async () => {
    const user = setupUser();
    const onParentDoubleClick = jest.fn<void, []>();
    const onTooltipDoubleClick = jest.fn<void, []>();
    render(
      <div onDoubleClick={onParentDoubleClick}>
        <Tooltip label="Tooltip content" onDoubleClick={onTooltipDoubleClick}>
          <button>Target</button>
        </Tooltip>
      </div>,
    );

    await user.hover(screen.getByRole("button", { name: "Target" }));
    await user.dblClick(await screen.findByRole("tooltip"));
    expect(onTooltipDoubleClick).toHaveBeenCalledTimes(1);
    expect(onParentDoubleClick).not.toHaveBeenCalled();
  });

  it("closes straight away when disabled and the pointer leaves the target", async () => {
    const user = setupUser();
    render(
      <div>
        <Tooltip label="Tooltip content" disabled>
          <button>Target</button>
        </Tooltip>
        <span>Elsewhere</span>
      </div>,
    );
    const target = screen.getByRole("button", { name: "Target" });

    await user.hover(target);
    expect(target).toHaveAttribute("aria-describedby");

    await user.hover(screen.getByText("Elsewhere"));
    expect(target).not.toHaveAttribute("aria-describedby");
  });

  it("doesn't catch the pointer when its owner controls whether it's open", async () => {
    const TooltipWithTarget = ({ opened }: { opened: boolean }) => (
      <Tooltip label="Tooltip content" opened={opened}>
        <button>Target</button>
      </Tooltip>
    );
    const { rerender } = render(<TooltipWithTarget opened={false} />);
    rerender(<TooltipWithTarget opened />);

    const tooltip = await screen.findByRole("tooltip");
    act(() => jest.advanceTimersByTime(LONGER_THAN_CLOSE_MS));
    expect(tooltip).not.toHaveAttribute("data-hoverable");
  });

  it("renders inside the portal target from context", async () => {
    const TooltipInsideTarget = () => {
      const [target, setTarget] = useState<HTMLElement | null>(null);
      return (
        <div ref={setTarget} data-testid="portal-target">
          <TooltipPortalTargetProvider target={target}>
            <Tooltip label="Tooltip content" opened>
              <button>Target</button>
            </Tooltip>
          </TooltipPortalTargetProvider>
        </div>
      );
    };
    render(<TooltipInsideTarget />);

    const tooltip = await screen.findByRole("tooltip");
    expect(screen.getByTestId("portal-target")).toContainElement(tooltip);
  });
});
