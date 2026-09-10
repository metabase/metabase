import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { DateRangePicker, type DateRangeValue } from "./DateRangePicker";

const setup = (value: DateRangeValue) => {
  const onChange = jest.fn();

  renderWithProviders(
    <DateRangePicker value={value} onChange={onChange} numberOfColumns={1} />,
  );

  return { onChange };
};

const openCalendar = async (name: string) => {
  await userEvent.click(screen.getByRole("button", { name }));
};

describe("DateRangePicker", () => {
  it("shows a placeholder until a range is picked", () => {
    setup([null, null]);

    expect(
      screen.getByRole("button", { name: "Select a date range" }),
    ).toBeInTheDocument();
  });

  it("completes a half-picked range with YYYY-MM-DD strings", async () => {
    const { onChange } = setup(["2026-03-10", null]);

    await openCalendar("March 10, 2026 –");
    await userEvent.click(screen.getByText("20"));

    expect(onChange).toHaveBeenCalledWith(["2026-03-10", "2026-03-20"]);
  });

  it("reports a half-picked range when a new range is started", async () => {
    const { onChange } = setup(["2026-03-10", "2026-03-20"]);

    await openCalendar("March 10, 2026 – March 20, 2026");
    await userEvent.click(screen.getByText("15"));

    expect(onChange).toHaveBeenCalledWith(["2026-03-15", null]);
  });
});
