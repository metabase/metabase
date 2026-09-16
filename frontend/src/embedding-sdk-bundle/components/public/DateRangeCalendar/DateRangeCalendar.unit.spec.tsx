import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { DateRangeCalendar, type DateRangeValue } from "./DateRangeCalendar";

const setup = (value: DateRangeValue) => {
  const onChange = jest.fn();

  renderWithProviders(
    <DateRangeCalendar value={value} onChange={onChange} numberOfColumns={1} />,
  );

  return { onChange };
};

// The public contract is `YYYY-MM-DD` strings on both ends — what the data-app
// query filters take — so these pin the value shape, not the calendar's looks.
describe("DateRangeCalendar", () => {
  it("completes a half-picked range with YYYY-MM-DD strings", async () => {
    const { onChange } = setup(["2026-03-10", null]);

    await userEvent.click(screen.getByText("20"));

    expect(onChange).toHaveBeenCalledWith(["2026-03-10", "2026-03-20"]);
  });

  it("reports a half-picked range when a new range is started", async () => {
    const { onChange } = setup(["2026-03-10", "2026-03-20"]);

    await userEvent.click(screen.getByText("15"));

    expect(onChange).toHaveBeenCalledWith(["2026-03-15", null]);
  });

  it("allows a single day as a range", async () => {
    const { onChange } = setup(["2026-03-10", null]);

    await userEvent.click(screen.getByText("10"));

    expect(onChange).toHaveBeenCalledWith(["2026-03-10", "2026-03-10"]);
  });
});
