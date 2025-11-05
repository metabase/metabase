import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import type { FieldValuesType } from "metabase-types/api";

import { FieldValuesTypePicker } from "./FieldValuesTypePicker";

interface SetupOpts {
  value?: FieldValuesType;
  onChange?: (value: FieldValuesType) => void;
}

const setup = ({ value = "list", onChange = jest.fn() }: SetupOpts = {}) => {
  renderWithProviders(
    <FieldValuesTypePicker
      placeholder="Select..."
      value={value}
      onChange={onChange}
    />,
  );

  return { onChange };
};

describe("FieldValuesTypePicker", () => {
  it("renders with the correct initial value", () => {
    setup({ value: "search" });

    const select = screen.getByPlaceholderText("Select...");

    expect(select).toHaveValue("Search box");
  });

  it("displays all available options when clicked", async () => {
    setup();

    const select = screen.getByPlaceholderText("Select...");

    await userEvent.click(select);

    expect(screen.getByText("Search box")).toBeInTheDocument();
    expect(screen.getByText("A list of all values")).toBeInTheDocument();
    expect(screen.getByText("Plain input box")).toBeInTheDocument();
  });

  it("calls onChange with the selected value when an option is chosen", async () => {
    const { onChange } = setup();

    const select = screen.getByPlaceholderText("Select...");

    await userEvent.click(select);
    await userEvent.click(screen.getByText("Search box"));

    expect(onChange).toHaveBeenCalledWith("search");
  });
});
