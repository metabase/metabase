import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { SelectButton } from "./SelectButton";

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

  it("should display a chevron", () => {
    render(<SelectButton>{title}</SelectButton>);

    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
  });

  describe("clear behavior", () => {
    const getClearButton = () => screen.getByRole("button", { name: "Clear" });
    const queryClearButton = () =>
      screen.queryByRole("button", { name: "Clear" });

    it("should not display the clear button when the value is selected, but onClear prop is not provided", () => {
      render(<SelectButton hasValue>{title}</SelectButton>);
      expect(queryClearButton()).not.toBeInTheDocument();
    });

    it("should replace the chevron with the clear button", () => {
      render(
        <SelectButton hasValue onClear={jest.fn()}>
          {title}
        </SelectButton>,
      );

      expect(getClearButton()).toBeInTheDocument();
      expect(
        screen.queryByLabelText("chevrondown icon"),
      ).not.toBeInTheDocument();
    });

    it("should not display the clear button when the value is not selected", () => {
      render(
        <SelectButton hasValue={false} onClear={jest.fn()}>
          {title}
        </SelectButton>,
      );
      expect(queryClearButton()).not.toBeInTheDocument();
    });

    it("should not display the clear button when disabled", () => {
      render(
        <SelectButton hasValue disabled onClear={jest.fn()}>
          {title}
        </SelectButton>,
      );

      expect(queryClearButton()).not.toBeInTheDocument();
      expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
    });

    it("should call onClear when the clear button is clicked", async () => {
      const onClear = jest.fn();
      render(
        <SelectButton hasValue onClear={onClear}>
          {title}
        </SelectButton>,
      );

      await userEvent.click(getClearButton());

      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it("should not call usual onClick when the clear button is clicked", async () => {
      const onClick = jest.fn();
      render(
        <SelectButton hasValue onClick={onClick} onClear={jest.fn()}>
          {title}
        </SelectButton>,
      );

      await userEvent.click(getClearButton());

      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
