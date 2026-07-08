import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { fireEvent, render, screen } from "__support__/ui";

import { PopoverWithRef } from "./PopoverWithRef";

interface TestAppProps {
  onChange: (opened: boolean) => void;
}

const TestApp = ({ onChange }: TestAppProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const [isAnchorMounted, setIsAnchorMounted] = useState(false);

  return (
    <div>
      <button onClick={() => setIsAnchorMounted(true)}>mount anchor</button>
      {isAnchorMounted && (
        <div ref={setAnchorEl} data-testid="anchor">
          anchor
        </div>
      )}
      <PopoverWithRef
        anchorEl={anchorEl}
        opened={anchorEl !== null}
        onChange={onChange}
      >
        popover content
      </PopoverWithRef>
    </div>
  );
};

const setup = () => {
  const onChange = jest.fn();
  render(<TestApp onChange={onChange} />);
  return { onChange };
};

describe("PopoverWithRef", () => {
  it("renders dropdown content for an anchor that appears after mount", async () => {
    setup();

    expect(screen.queryByText("popover content")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("mount anchor"));

    expect(await screen.findByText("popover content")).toBeInTheDocument();
  });

  it("wires a late-appearing anchor as the popover target for outside clicks", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("mount anchor"));
    await screen.findByText("popover content");

    fireEvent.mouseDown(screen.getByTestId("anchor"));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
