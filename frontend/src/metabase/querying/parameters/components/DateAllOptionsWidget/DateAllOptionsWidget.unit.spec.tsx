import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import { DateAllOptionsWidget } from "./DateAllOptionsWidget";

type SetupOpts = {
  value?: string;
};

function setup({ value }: SetupOpts = {}) {
  const onChange = jest.fn();
  renderWithProviders(
    <DateAllOptionsWidget value={value} onChange={onChange} />,
  );
  return { onChange };
}

describe("DateAllOptionsWidget", () => {
  it('should allow to select a "specific" filter', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("Fixed date range…"));
    await userEvent.click(screen.getByText("On"));
    const panel = screen.getByRole("tabpanel", { name: "On" });
    const input = within(panel).getByLabelText("Date");
    await userEvent.clear(input);
    await userEvent.type(input, "Feb 15, 2020");
    await userEvent.click(within(panel).getByText("Apply"));
    expect(onChange).toHaveBeenCalledWith("2020-02-15");
  });

  it('should accept a previously selected "specific" filter', () => {
    setup({ value: "2020-02-15" });
    const panel = screen.getByRole("tabpanel", { name: "On" });
    const input = within(panel).getByLabelText("Date");
    expect(input).toHaveDisplayValue("February 15, 2020");
  });

  it('should allow to select a "relative" filter', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("Relative date range…"));
    await userEvent.click(screen.getByText("Current"));
    const panel = screen.getByRole("tabpanel", { name: "Current" });
    await userEvent.click(within(panel).getByText("Week"));
    expect(onChange).toHaveBeenCalledWith("thisweek");
  });

  it('should accept a previously selected "relative" filter', async () => {
    setup({ value: "thisweek" });
    const panel = screen.getByRole("tabpanel", { name: "Current" });
    expect(within(panel).getByRole("button", { name: "Week" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(panel).getByRole("button", { name: "Year" }),
    ).not.toHaveAttribute("aria-selected", "true");
  });

  it('should allow to select an "exclude" filter', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("Exclude…"));
    await userEvent.click(screen.getByText("Hours of the day…"));
    await userEvent.click(screen.getByText("5 AM"));
    await userEvent.click(screen.getByText("2 PM"));
    await userEvent.click(screen.getByText("Apply"));
    expect(onChange).toHaveBeenCalledWith("exclude-hours-5-14");
  });

  it('should accept a previously selected "exclude" filter', () => {
    setup({ value: "exclude-hours-5-14" });
    expect(screen.getByLabelText("5 AM")).toBeChecked();
    expect(screen.getByLabelText("2 PM")).toBeChecked();
    expect(screen.getByLabelText("3 PM")).not.toBeChecked();
  });
});
