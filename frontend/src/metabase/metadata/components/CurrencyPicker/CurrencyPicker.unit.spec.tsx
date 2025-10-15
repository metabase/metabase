import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { CurrencyPicker } from "./CurrencyPicker";

interface SetupOpts {
  value?: string;
}

function setup({ value = "USD" }: SetupOpts = {}) {
  const onChange = jest.fn();

  const { rerender } = renderWithProviders(
    <CurrencyPicker value={value} onChange={onChange} />,
  );

  return { rerender, onChange };
}

describe("CurrencyPicker", () => {
  it("renders currency options in the dropdown", async () => {
    setup();

    await userEvent.click(
      screen.getByPlaceholderText("Select a currency type"),
    );
    expect(screen.getByText("US Dollar")).toBeInTheDocument();
    expect(screen.getByText("Canadian Dollar")).toBeInTheDocument();
    expect(screen.getByText("CA$")).toBeInTheDocument();
  });

  it("calls onChange when a different currency is selected", async () => {
    const { onChange } = setup({ value: "USD" });

    await userEvent.click(
      screen.getByPlaceholderText("Select a currency type"),
    );
    await userEvent.click(screen.getByText("Euro"));
    expect(onChange).toHaveBeenCalledWith("EUR");
  });

  it("does not call onChange when the same currency is selected", async () => {
    const { onChange } = setup({ value: "USD" });

    await userEvent.click(
      screen.getByPlaceholderText("Select a currency type"),
    );
    await userEvent.click(screen.getByText("US Dollar"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("updates selected value when value prop changes", async () => {
    const { rerender, onChange } = setup();

    expect(screen.getByDisplayValue("US Dollar")).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("British Pound Sterling"),
    ).not.toBeInTheDocument();

    rerender(<CurrencyPicker value="GBP" onChange={onChange} />);
    expect(
      screen.getByDisplayValue("British Pound Sterling"),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue("US Dollar")).not.toBeInTheDocument();
  });
});
