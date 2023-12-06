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

  it("should be able to set the date range via the calendar", () => {
    const { onChange, onSubmit } = setup();

    const calendars = screen.getAllByRole("table");
    userEvent.click(within(calendars[0]).getByText("12"));
    userEvent.click(within(calendars[1]).getByText("5"));

    expect(onChange).toHaveBeenCalledWith([
      new Date(2020, 0, 12),
      new Date(2020, 1, 5),
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should be able to set the date range via the calendar when there is time", () => {
    const { onChange, onSubmit } = setup({
      value: [START_DATE_TIME, END_DATE_TIME],
    });

    const calendars = screen.getAllByRole("table");
    userEvent.click(within(calendars[0]).getByText("12"));
    userEvent.click(within(calendars[1]).getByText("5"));

    expect(onChange).toHaveBeenLastCalledWith([
      new Date(2020, 0, 12, 5, 20),
      new Date(2020, 1, 5, 20, 30),
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should be able to set the date range start via the input", () => {
    const { onChange, onSubmit } = setup();

    const input = screen.getByLabelText("Start date");
    userEvent.clear(input);
    userEvent.type(input, "Feb 15, 2020");
    expect(onChange).toHaveBeenLastCalledWith([
      new Date(2020, 1, 15),
      END_DATE,
    ]);
    expect(onSubmit).not.toHaveBeenCalled();

    userEvent.type(input, "{enter}");
    expect(onSubmit).toHaveBeenCalled();
  });

  it("should be able to set the date range start via the input when there is time", () => {
    const { onChange, onSubmit } = setup({
      value: [START_DATE_TIME, END_DATE],
    });

    const input = screen.getByLabelText("Start date");
    userEvent.clear(input);
    userEvent.type(input, "Feb 15, 2020");
    expect(onChange).toHaveBeenLastCalledWith([
      new Date(2020, 1, 15, 5, 20),
      END_DATE,
    ]);
    expect(onSubmit).not.toHaveBeenCalled();

    userEvent.type(input, "{enter}");
    expect(onSubmit).toHaveBeenCalled();
  });

  it("should be able to set the date range end via the input", () => {
    const { onChange, onSubmit } = setup();

    const input = screen.getByLabelText("End date");
    userEvent.clear(input);
    userEvent.type(input, "Jul 15, 2020");

    expect(onChange).toHaveBeenLastCalledWith([
      START_DATE,
      new Date(2020, 6, 15),
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should be able to set the date range end via the input when there is time", () => {
    const { onChange, onSubmit } = setup({
      value: [START_DATE, END_DATE_TIME],
    });

    const input = screen.getByLabelText("End date");
    userEvent.clear(input);
    userEvent.type(input, "Jul 15, 2020");

    expect(onChange).toHaveBeenLastCalledWith([
      START_DATE,
      new Date(2020, 6, 15, 20, 30),
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should be able to add time", () => {
    const { onChange, onSubmit } = setup();

    userEvent.click(screen.getByText("Add time"));
    const input = screen.getByLabelText("Start time");
    userEvent.clear(input);
    userEvent.type(input, "11:20");

    expect(onChange).toHaveBeenLastCalledWith([
      new Date(2020, 0, 10, 11, 20),
      END_DATE,
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should be able to update the start time", () => {
    const { onChange, onSubmit } = setup({
      value: [START_DATE_TIME, END_DATE_TIME],
    });

    const input = screen.getByLabelText("Start time");
    userEvent.clear(input);
    userEvent.type(input, "11:20");

    expect(onChange).toHaveBeenLastCalledWith([
      new Date(2020, 0, 10, 11, 20),
      END_DATE_TIME,
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should be able to update the end time", () => {
    const { onChange, onSubmit } = setup({
      value: [START_DATE_TIME, END_DATE_TIME],
    });

    const input = screen.getByLabelText("End time");
    userEvent.clear(input);
    userEvent.type(input, "11:20");

    expect(onChange).toHaveBeenLastCalledWith([
      START_DATE_TIME,
      new Date(2020, 1, 9, 11, 20),
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should be able to remove time", () => {
    const { onChange, onSubmit } = setup({
      value: [START_DATE_TIME, END_DATE_TIME],
    });

    userEvent.click(screen.getByText("Remove time"));

    expect(screen.queryByLabelText("Start time")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("End time")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith([START_DATE, END_DATE]);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
