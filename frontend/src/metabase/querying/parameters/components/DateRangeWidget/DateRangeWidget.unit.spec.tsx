import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { DateRangeWidget } from "./DateRangeWidget";

type SetupOpts = {
  value?: string;
};

function setup({ value }: SetupOpts = {}) {
  const onChange = jest.fn();
  render(<DateRangeWidget value={value} onChange={onChange} />);
  return { onChange };
}

describe("DateRangeWidget", () => {
  it("should allow to select a date range", async () => {
    const { onChange } = setup();
    const startInput = screen.getByLabelText("Start date");
    await userEvent.clear(startInput);
    await userEvent.type(startInput, "Feb 15, 2020");
    const endInput = screen.getByLabelText("End date");
    await userEvent.clear(endInput);
    await userEvent.type(endInput, "Mar 5, 2020");
    await userEvent.click(screen.getByText("Apply"));
    expect(onChange).toHaveBeenCalledWith("2020-02-15~2020-03-05");
  });

  it("should accept a previously selected date range", async () => {
    setup({ value: "2020-02-15~2020-03-05" });
    expect(screen.getByText("February 2020")).toBeInTheDocument();
  });
});
