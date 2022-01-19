import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Toggle from "./Toggle";

describe("Toggle", () => {
  it("should toggle on click", () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const toggle = screen.getByRole("checkbox");
    userEvent.click(toggle);

    expect(toggle).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("should receive focus on tab", () => {
    render(<Toggle value={false} />);

    const toggle = screen.getByRole("checkbox");
    userEvent.tab();

    expect(toggle).toHaveFocus();
  });
});
