import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { NumberInput } from "metabase/ui";
import { render, screen } from "__support__/ui";

interface SetupOpts {
  defaultValue?: number;
}

function setup({ defaultValue }: SetupOpts = {}) {
  const onChange = jest.fn();

  render(<TestInput defaultValue={defaultValue} onChange={onChange} />);

  return { onChange };
}

interface TestInputProps {
  defaultValue?: number | "";
  onChange?: (value: number | "") => void;
}

function TestInput({ defaultValue = "", onChange }: TestInputProps) {
  const [value, setValue] = useState(defaultValue);

  const handleChange = (value: number | "") => {
    setValue(value);
    onChange?.(value);
  };

  return <NumberInput label="Number" value={value} onChange={handleChange} />;
}

describe("NumberInput", () => {
  it("should show the default value", () => {
    setup({ defaultValue: 20.123 });

    const input = screen.getByLabelText("Number");
    expect(input).toHaveValue("20.123");
  });

  it("should allow to enter an integer value", () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("Number");
    userEvent.type(input, "51");

    expect(onChange).toHaveBeenCalledWith(51);
  });

  it("should allow to enter a fractional value", () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("Number");
    userEvent.type(input, "15.16");

    expect(onChange).toHaveBeenCalledWith(15.16);
  });

  it("should reset to the correct value on blur", () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("Number");
    userEvent.type(input, "12abc");
    userEvent.tab();

    expect(onChange).toHaveBeenCalledWith(12);
  });

  it("should reset to an empty string on blur for invalid values", () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("Number");
    userEvent.type(input, "abc");
    userEvent.tab();

    expect(onChange).toHaveBeenCalledWith("");
  });
});
