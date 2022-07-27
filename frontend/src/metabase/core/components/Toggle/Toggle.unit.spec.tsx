import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Toggle from "./Toggle";

const user = userEvent.setup();

describe("Toggle", () => {
  it("should receive focus on tab", async () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("switch");
    await user.tab();

    expect(checkbox).toHaveFocus();
  });

  it("should toggle on enter", async () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("switch");
    await user.tab();
    await user.type(checkbox, "{Enter}");

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("should toggle on space", async () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("switch");
    await user.tab();
    await user.type(checkbox, "{Space}");

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("should toggle on click", async () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("switch");
    await user.click(checkbox);

    expect(checkbox).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
