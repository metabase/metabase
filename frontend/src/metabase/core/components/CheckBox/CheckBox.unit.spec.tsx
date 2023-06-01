import { render, screen } from "@testing-library/react";
import userEvent, { specialChars } from "@testing-library/user-event";
import CheckBox from "./CheckBox";

describe("CheckBox", () => {
  it("should receive focus on tab", () => {
    const onChange = jest.fn();

    render(<CheckBox checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    userEvent.tab();

    expect(checkbox).toHaveFocus();
  });

  it("should change on enter", () => {
    const onChange = jest.fn();

    render(<CheckBox checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    userEvent.tab();
    userEvent.type(checkbox, specialChars.enter);

    expect(onChange).toHaveBeenCalled();
  });

  it("should change on space", () => {
    const onChange = jest.fn();

    render(<CheckBox checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    userEvent.tab();
    userEvent.type(checkbox, specialChars.space);

    expect(onChange).toHaveBeenCalled();
  });

  it("should change on click", () => {
    const onChange = jest.fn();

    render(<CheckBox checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    userEvent.click(checkbox);

    expect(checkbox).toHaveFocus();
    expect(onChange).toHaveBeenCalled();
  });
});
