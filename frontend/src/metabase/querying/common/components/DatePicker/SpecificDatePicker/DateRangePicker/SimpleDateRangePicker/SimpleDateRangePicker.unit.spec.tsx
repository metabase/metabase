import _userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import type { DateRangePickerValue } from "../types";

import { SimpleDateRangePicker } from "./SimpleDateRangePicker";

const START_DATE = new Date(2020, 0, 10);
const END_DATE = new Date(2020, 1, 9);

const START_DATE_TIME = new Date(2020, 0, 10, 5, 20);
const END_DATE_TIME = new Date(2020, 1, 9, 20, 30);

interface SetupOpts {
  value?: DateRangePickerValue;
}

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

function setup({
  value = { dateRange: [START_DATE, END_DATE], hasTime: false },
}: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <SimpleDateRangePicker value={value} onChange={onChange} />,
  );

  return { onChange };
}

describe("SimpleDateRangePicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 15));
  });

  it("should be able to set the date range via the calendar", async () => {
    const { onChange } = setup();

    const calendars = screen.getAllByRole("table");
    await userEvent.click(within(calendars[0]).getByText("12"));
    await userEvent.click(within(calendars[1]).getByText("5"));

    expect(onChange).toHaveBeenCalledWith({
      dateRange: [new Date(2020, 0, 12), new Date(2020, 1, 5)],
      hasTime: false,
    });
  });

  it("should be able to set the date range via the calendar when there is time", async () => {
    const { onChange } = setup({
      value: {
        dateRange: [START_DATE_TIME, END_DATE_TIME],
        hasTime: true,
      },
    });

    const calendars = screen.getAllByRole("table");
    await userEvent.click(within(calendars[0]).getByText("12"));
    await userEvent.click(within(calendars[1]).getByText("5"));

    expect(onChange).toHaveBeenLastCalledWith({
      dateRange: [new Date(2020, 0, 12, 5, 20), new Date(2020, 1, 5, 20, 30)],
      hasTime: true,
    });
  });

  it("should be able to set the date range start via the input", async () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("Start date");
    await userEvent.clear(input);
    await userEvent.type(input, "Feb 15, 2020");

    expect(onChange).toHaveBeenLastCalledWith({
      dateRange: [new Date(2020, 1, 15), END_DATE],
      hasTime: false,
    });
  });

  it("should be able to set the date range start via the input when there is time", async () => {
    const { onChange } = setup({
      value: {
        dateRange: [START_DATE_TIME, END_DATE],
        hasTime: true,
      },
    });

    const input = screen.getByLabelText("Start date");
    await userEvent.clear(input);
    await userEvent.type(input, "Feb 15, 2020");

    expect(onChange).toHaveBeenLastCalledWith({
      dateRange: [new Date(2020, 1, 15, 5, 20), END_DATE],
      hasTime: true,
    });
  });

  it("should be able to set the date range end via the input", async () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("End date");
    await userEvent.clear(input);
    await userEvent.type(input, "Jul 15, 2020");

    expect(onChange).toHaveBeenLastCalledWith({
      dateRange: [START_DATE, new Date(2020, 6, 15)],
      hasTime: false,
    });
  });

  it("should be able to set the date range end via the input when there is time", async () => {
    const { onChange } = setup({
      value: {
        dateRange: [START_DATE, END_DATE_TIME],
        hasTime: true,
      },
    });

    const input = screen.getByLabelText("End date");
    await userEvent.clear(input);
    await userEvent.type(input, "Jul 15, 2020");

    expect(onChange).toHaveBeenLastCalledWith({
      dateRange: [START_DATE, new Date(2020, 6, 15, 20, 30)],
      hasTime: true,
    });
  });

  it("should be able to add time", async () => {
    const { onChange } = setup();
    expect(screen.queryByLabelText("Start time")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("End time")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Add time"));
    expect(onChange).toHaveBeenLastCalledWith({
      dateRange: [START_DATE, END_DATE],
      hasTime: true,
    });
  });

  it("should be able to update the start time", async () => {
    const { onChange } = setup({
      value: {
        dateRange: [START_DATE_TIME, END_DATE_TIME],
        hasTime: true,
      },
    });

    const input = screen.getByLabelText("Start time");
    await userEvent.clear(input);
    await userEvent.type(input, "11:20");

    expect(onChange).toHaveBeenLastCalledWith({
      dateRange: [new Date(2020, 0, 10, 11, 20), END_DATE_TIME],
      hasTime: true,
    });
  });

  it("should be able to update the end time", async () => {
    const { onChange } = setup({
      value: {
        dateRange: [START_DATE_TIME, END_DATE_TIME],
        hasTime: true,
      },
    });

    const input = screen.getByLabelText("End time");
    await userEvent.clear(input);
    await userEvent.type(input, "11:20");

    expect(onChange).toHaveBeenLastCalledWith({
      dateRange: [START_DATE_TIME, new Date(2020, 1, 9, 11, 20)],
      hasTime: true,
    });
  });

  it("should be able to remove time", async () => {
    const { onChange } = setup({
      value: {
        dateRange: [START_DATE_TIME, END_DATE_TIME],
        hasTime: true,
      },
    });

    await userEvent.click(screen.getByText("Remove time"));

    expect(onChange).toHaveBeenLastCalledWith({
      dateRange: [START_DATE, END_DATE],
      hasTime: false,
    });
  });
});
