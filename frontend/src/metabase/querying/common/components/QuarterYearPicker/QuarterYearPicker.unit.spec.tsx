import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type { QuarterYearPickerValue } from "metabase/querying/common/types";

import { QuarterYearPicker } from "./QuarterYearPicker";

type SetupOpts = {
  value?: QuarterYearPickerValue;
};

function setup({ value }: SetupOpts = {}) {
  const onChange = jest.fn();
  render(<QuarterYearPicker value={value} onChange={onChange} />);
  return { onChange };
}

describe("QuarterYearPicker", () => {
  it("should be able to change a quarter", async () => {
    const { onChange } = setup({
      value: { type: "quarter", year: 2020, quarter: 1 },
    });

    await userEvent.click(screen.getByText("Q2"));

    expect(onChange).toHaveBeenCalledWith({
      type: "quarter",
      year: 2020,
      quarter: 2,
    });
  });

  it("should be able to change a year", async () => {
    const { onChange } = setup({
      value: { type: "quarter", year: 2020, quarter: 1 },
    });

    await userEvent.click(screen.getByText("2020"));
    await userEvent.click(screen.getByText("2024"));
    await userEvent.click(screen.getByText("Q3"));

    expect(onChange).toHaveBeenCalledWith({
      type: "quarter",
      year: 2024,
      quarter: 3,
    });
  });

  it("should accept an empty value", () => {
    setup();
    expect(screen.getByText("Q1")).toBeInTheDocument();
  });
});
