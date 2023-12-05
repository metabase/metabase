import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import type { RelativeDatePickerValue } from "../../types";
import { CurrentDatePicker } from "./CurrentDatePicker";

const DEFAULT_VALUE: RelativeDatePickerValue = {
  type: "relative",
  value: "current",
  unit: "hour",
};

interface SetupOpts {
  value?: RelativeDatePickerValue;
}

function setup({ value = DEFAULT_VALUE }: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(<CurrentDatePicker value={value} onChange={onChange} />);

  return { onChange };
}

describe("CurrentDatePicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  it("should be able to filter by a current interval", () => {
    const { onChange } = setup();

    userEvent.click(screen.getByText("Week"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "week",
    });
  });

  it("should show the date range for the selected interval", () => {
    setup();

    userEvent.hover(screen.getByText("Week"));

    expect(
      screen.getByText("Right now, this is Dec 29, 2019 – Jan 4, 2020"),
    ).toBeInTheDocument();
  });
});
