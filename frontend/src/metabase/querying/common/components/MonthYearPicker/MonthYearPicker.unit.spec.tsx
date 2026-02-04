import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type { MonthYearPickerValue } from "metabase/querying/common/types";

import { MonthYearPicker } from "./MonthYearPicker";

type SetupOpts = {
  value?: MonthYearPickerValue;
};

function setup({ value }: SetupOpts) {
  const onChange = jest.fn();
  render(<MonthYearPicker value={value} onChange={onChange} />);
  return { onChange };
}

describe("MonthYearPicker", () => {
  it("should be able to change a month", async () => {
    const { onChange } = setup({
      value: { type: "month", year: 2024, month: 12 },
    });

    await userEvent.click(screen.getByText("May"));

    expect(onChange).toHaveBeenCalledWith({
      type: "month",
      year: 2024,
      month: 5,
    });
  });

  it("should be able to change a year", async () => {
    const { onChange } = setup({
      value: { type: "month", year: 2024, month: 12 },
    });

    await userEvent.click(screen.getByText("2024"));
    await userEvent.click(screen.getByText("2025"));
    await userEvent.click(screen.getByText("Jan"));

    expect(onChange).toHaveBeenCalledWith({
      type: "month",
      year: 2025,
      month: 1,
    });
  });
});
