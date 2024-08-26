import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SelectButton from "./SelectButton";

describe("SelectButton", () => {
  const title = "Select an option";

  it("should render correctly", () => {
    render(<SelectButton>{title}</SelectButton>);

    expect(screen.getByRole("button")).toHaveTextContent(title);
  });

  it("should receive focus on tab", async () => {
    render(<SelectButton>{title}</SelectButton>);
    await userEvent.tab();

    expect(screen.getByRole("button")).toHaveFocus();
  });

  it("should not receive focus on tab when disabled", async () => {
    render(<SelectButton disabled>{title}</SelectButton>);
    await userEvent.tab();

    expect(screen.getByRole("button")).not.toHaveFocus();
  });

  describe("clear behavior", () => {
    it("should not display clear icon when the value is selected, but onClear prop is not provided", () => {
      render(<SelectButton hasValue>{title}</SelectButton>);
      expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
    });

    it("should not display clear icon when the value is not selected", () => {
      render(
        <SelectButton hasValue={false} onClear={jest.fn()}>
          {title}
        </SelectButton>,
      );
      expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
    });

    it("should call onClear when close icon is clicked", async () => {
      const onClear = jest.fn();
      render(
        <SelectButton hasValue onClear={onClear}>
          {title}
        </SelectButton>,
      );

      await userEvent.click(screen.getByLabelText("close icon"));

      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it("should not call usual onClick when close icon is clicked", async () => {
      const onClick = jest.fn();
      render(
        <SelectButton hasValue onClick={onClick} onClear={jest.fn()}>
          {title}
        </SelectButton>,
      );

      await userEvent.click(screen.getByLabelText("close icon"));

      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
