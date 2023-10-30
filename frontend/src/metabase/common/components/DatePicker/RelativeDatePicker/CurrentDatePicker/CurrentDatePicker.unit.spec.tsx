import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";
import type { RelativeDatePickerValue } from "../types";
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

  render(<CurrentDatePicker value={DEFAULT_VALUE} onChange={onChange} />);

  return { onChange };
}

describe("CurrentDatePicker", () => {
  it("should be able to filter by a current interval", () => {
    const { onChange } = setup();

    userEvent.click(screen.getByText("Week"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "week",
    });
  });
});
