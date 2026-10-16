import userEvent from "@testing-library/user-event";

import { act, render, screen, waitFor } from "__support__/ui";
import { delay } from "metabase/utils/promise";

import { Tooltip } from "./Tooltip";
import { TOOLTIP_CLOSE_DELAY_MS } from "./Tooltip.config";

const LONGER_THAN_CLOSE_DELAY_MS = TOOLTIP_CLOSE_DELAY_MS * 3;

const setup = () => {
  const onParentClick = jest.fn<void, []>();
  const onParentPointerDown = jest.fn<void, []>();
  render(
    <div onClick={onParentClick} onPointerDown={onParentPointerDown}>
      <Tooltip label="Tooltip content">
        <button>Target</button>
      </Tooltip>
    </div>,
  );
  return { onParentClick, onParentPointerDown };
};

describe("Tooltip", () => {
  it("stays open while the pointer is over the tooltip and closes when it leaves", async () => {
    setup();
    const target = screen.getByRole("button", { name: "Target" });

    await userEvent.hover(target);
    const tooltip = await screen.findByRole("tooltip");
    await waitFor(() => expect(tooltip).toHaveAttribute("data-hoverable"));

    await userEvent.unhover(target);
    await userEvent.hover(tooltip);
    await act(() => delay(LONGER_THAN_CLOSE_DELAY_MS));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await userEvent.unhover(tooltip);
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
    setup();
    const target = screen.getByRole("button", { name: "Target" });

    await userEvent.hover(target);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    await userEvent.unhover(target);
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  it("doesn't pass clicks on the tooltip to the target's parents", async () => {
    const { onParentClick, onParentPointerDown } = setup();
    const target = screen.getByRole("button", { name: "Target" });

    await userEvent.click(target);
    expect(onParentClick).toHaveBeenCalledTimes(1);
    expect(onParentPointerDown).toHaveBeenCalledTimes(1);

    await userEvent.click(await screen.findByText("Tooltip content"));
    await userEvent.click(await screen.findByRole("tooltip"));
    expect(onParentClick).toHaveBeenCalledTimes(1);
    expect(onParentPointerDown).toHaveBeenCalledTimes(1);
  });

  it("still stops events on the tooltip reaching the target's parents when the caller handles them", async () => {
    const onParentDoubleClick = jest.fn<void, []>();
    const onTooltipDoubleClick = jest.fn<void, []>();
    render(
      <div onDoubleClick={onParentDoubleClick}>
        <Tooltip label="Tooltip content" onDoubleClick={onTooltipDoubleClick}>
          <button>Target</button>
        </Tooltip>
      </div>,
    );

    await userEvent.hover(screen.getByRole("button", { name: "Target" }));
    await userEvent.dblClick(await screen.findByRole("tooltip"));
    expect(onTooltipDoubleClick).toHaveBeenCalledTimes(1);
    expect(onParentDoubleClick).not.toHaveBeenCalled();
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
    await act(() => delay(LONGER_THAN_CLOSE_DELAY_MS));
    expect(tooltip).not.toHaveAttribute("data-hoverable");
  });
});
