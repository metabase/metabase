import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import type { SpecificDatePickerValue } from "../../types";

import { SimpleSpecificDatePicker } from "./SimpleSpecificDatePicker";

interface SetupOpts {
  value: SpecificDatePickerValue;
}

function setup({ value }: SetupOpts) {
  const onChange = jest.fn();

  renderWithProviders(
    <SimpleSpecificDatePicker value={value} onChange={onChange} />,
  );

  return { onChange };
}

describe("SimpleSpecificDatePicker", () => {
  it("should be able to change a specific date value", async () => {
    const { onChange } = setup({
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2015, 1, 10)],
        hasTime: false,
      },
    });

    await userEvent.click(screen.getByText("15"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: "=",
      values: [new Date(2015, 1, 15)],
      hasTime: false,
    });
  });
});
