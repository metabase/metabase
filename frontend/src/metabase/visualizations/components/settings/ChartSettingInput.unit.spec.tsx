import type { ComponentProps } from "react";

import { fireEvent, render, screen } from "__support__/ui";

import { ChartSettingInput } from "./ChartSettingInput";

describe("ChartSettingInput", () => {
  const setup = (props: ComponentProps<typeof ChartSettingInput>) => {
    const { rerender } = render(<ChartSettingInput {...props} />);

    return { rerender };
  };

  it("should call onChange when the input is blurred", () => {
    const onChange = jest.fn();

    setup({
      value: "",
      placeholder: "Placeholder",
      onChange,
    });

    const input = screen.getByPlaceholderText("Placeholder");
    input.focus();
    fireEvent.change(input, { target: { value: "New Value" } });
    input.blur();

    expect(onChange).toHaveBeenCalledWith("New Value");
  });

  it('should not call onChange when the input is blurred with the same value as the "value" prop', () => {
    const onChange = jest.fn();

    setup({
      value: "Initial Value",
      placeholder: "Placeholder",
      onChange,
    });

    const input = screen.getByPlaceholderText("Placeholder");
    input.focus();
    fireEvent.change(input, { target: { value: "Initial Value" } });
    input.blur();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("should update when the value prop changes", () => {
    const onChange = jest.fn();

    const { rerender } = setup({
      value: "Initial Value",
      placeholder: "Placeholder",
      onChange,
    });

    const input = screen.getByPlaceholderText("Placeholder");
    expect(input).toHaveValue("Initial Value");

    rerender(
      <ChartSettingInput
        value="New Value"
        placeholder="Placeholder"
        onChange={onChange}
      />,
    );

    expect(input).toHaveValue("New Value");

    expect(onChange).not.toHaveBeenCalled();
  });
});
