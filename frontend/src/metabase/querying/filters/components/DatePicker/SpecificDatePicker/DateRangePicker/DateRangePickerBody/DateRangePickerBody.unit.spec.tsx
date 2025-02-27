import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { DateRangePickerBody } from "./DateRangePickerBody";

type SetupOpts = {
  value: [Date, Date];
  hasTime?: boolean;
};

function setup({ value, hasTime = false }: SetupOpts) {
  const onChange = jest.fn();
  render(
    <DateRangePickerBody value={value} hasTime={hasTime} onChange={onChange} />,
  );
  return { onChange };
}

describe("DateRangePickerBody", () => {
  it("should highlight the start date of the in-progress date range selection (metabase#51994)", async () => {
    const { onChange } = setup({
      value: [new Date(2020, 0, 5), new Date(2020, 1, 20)],
    });
    expect(screen.getByLabelText("5 January 2020")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByLabelText("20 February 2020")).toHaveAttribute(
      "data-selected",
      "true",
    );

    await userEvent.click(screen.getByLabelText("10 January 2020"));
    expect(screen.getByLabelText("5 January 2020")).not.toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByLabelText("20 February 2020")).not.toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByLabelText("10 January 2020")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("8 February 2020"));
    expect(onChange).toHaveBeenCalledWith([
      new Date(2020, 0, 10),
      new Date(2020, 1, 8),
    ]);
  });
});
