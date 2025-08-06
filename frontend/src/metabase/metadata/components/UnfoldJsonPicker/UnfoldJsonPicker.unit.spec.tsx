import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";

import { UnfoldJsonPicker } from "./UnfoldJsonPicker";

interface SetupOpts {
  value?: boolean;
  onChange?: (value: boolean) => void;
}

const setup = ({ value = false, onChange = jest.fn() }: SetupOpts = {}) => {
  renderWithProviders(
    <UnfoldJsonPicker
      placeholder="Select..."
      value={value}
      onChange={onChange}
    />,
  );

  return { onChange };
};

describe("UnfoldJsonPicker", () => {
  it("renders with the correct initial value", () => {
    setup({ value: true });

    const select = screen.getByPlaceholderText("Select...");

    expect(select).toHaveValue("Yes");
  });

  it("displays all available options when clicked", async () => {
    setup();

    const select = screen.getByPlaceholderText("Select...");

    await userEvent.click(select);

    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("calls onChange with true when Yes is selected", async () => {
    const { onChange } = setup();

    const select = screen.getByPlaceholderText("Select...");

    await userEvent.click(select);
    await userEvent.click(screen.getByText("Yes"));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange with false when No is selected", async () => {
    const { onChange } = setup({ value: true });

    const select = screen.getByPlaceholderText("Select...");

    await userEvent.click(select);
    await userEvent.click(screen.getByText("No"));

    expect(onChange).toHaveBeenCalledWith(false);
  });
});
