import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Toggle from "./Toggle";

describe("Toggle", () => {
  it("should receive focus on tab", () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    userEvent.tab();

    expect(checkbox).toHaveFocus();
  });

  it("should toggle on enter", () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    userEvent.tab();
    userEvent.type(checkbox, "{enter}");

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("should toggle on space", () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    userEvent.tab();
    userEvent.type(checkbox, "{space}");

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("should toggle on click", () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    userEvent.click(checkbox);

    expect(checkbox).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
