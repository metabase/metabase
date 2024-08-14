import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CheckBox from "./CheckBox";

describe("CheckBox", () => {
  it("should receive focus on tab", async () => {
    const onChange = jest.fn();

    render(<CheckBox checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.tab();

    expect(checkbox).toHaveFocus();
  });

  it("should change on enter", async () => {
    const onChange = jest.fn();

    render(<CheckBox checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.tab();
    await userEvent.type(checkbox, "{Enter}");

    expect(onChange).toHaveBeenCalled();
  });

  it("should change on space", async () => {
    const onChange = jest.fn();

    render(<CheckBox checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.tab();
    await userEvent.type(checkbox, "Space");

    expect(onChange).toHaveBeenCalled();
  });

  it("should change on click", async () => {
    const onChange = jest.fn();

    render(<CheckBox checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);

    expect(checkbox).toHaveFocus();
    expect(onChange).toHaveBeenCalled();
  });
});
