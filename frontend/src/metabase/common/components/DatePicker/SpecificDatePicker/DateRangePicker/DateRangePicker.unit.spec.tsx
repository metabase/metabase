import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "__support__/ui";
import { DateRangePicker } from "./DateRangePicker";

const START_DATE = new Date(2020, 0, 10);
const END_DATE = new Date(2020, 1, 9);

const START_DATE_TIME = new Date(2020, 0, 10, 5, 20);
const END_DATE_TIME = new Date(2020, 1, 9, 20, 30);

interface SetupOpts {
  value?: [Date, Date];
  isNew?: boolean;
}

function setup({
  value = [START_DATE, END_DATE],
  isNew = false,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onSubmit = jest.fn();

  renderWithProviders(
    <DateRangePicker
      value={value}
      isNew={isNew}
      onChange={onChange}
      onSubmit={onSubmit}
    />,
  );

  return { onChange, onSubmit };
}

describe("SingleDatePicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 15));
  });

  it("should be able to set the date via the calendar", () => {
    const { onChange } = setup();

    const calendars = screen.getAllByRole("table");
    userEvent.click(within(calendars[0]).getByText("12"));
    userEvent.click(within(calendars[1]).getByText("5"));

    expect(onChange).toHaveBeenCalledWith([
      new Date(2020, 0, 12),
      new Date(2020, 1, 5),
    ]);
  });

  it("should be able to set the date with time via the calendar", () => {
    const { onChange } = setup({
      value: [START_DATE_TIME, END_DATE_TIME],
    });

    const calendars = screen.getAllByRole("table");
    userEvent.click(within(calendars[0]).getByText("12"));
    userEvent.click(within(calendars[1]).getByText("5"));

    expect(onChange).toHaveBeenCalledWith([
      new Date(2020, 0, 12, 5, 20),
      new Date(2020, 1, 5, 20, 30),
    ]);
  });
});
