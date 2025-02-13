import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Toggle from "./Toggle";

describe("Toggle", () => {
  it("should receive focus on tab", async () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("switch");
    await userEvent.tab();

    expect(checkbox).toHaveFocus();
  });

  it("should toggle on enter", async () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("switch");
    await userEvent.tab();
    await userEvent.type(checkbox, "{Enter}");

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("should toggle on space", async () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("switch");
    await userEvent.tab();
    await userEvent.type(checkbox, "{Space}");

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("should toggle on click", async () => {
    const onChange = jest.fn();

    render(<Toggle value={false} onChange={onChange} />);

    const checkbox = screen.getByRole("switch");
    await userEvent.click(checkbox);

    expect(checkbox).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
