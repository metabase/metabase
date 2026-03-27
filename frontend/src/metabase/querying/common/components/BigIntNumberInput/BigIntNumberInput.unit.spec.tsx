import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { NumberValue } from "metabase/lib/number";

import { BigIntNumberInput } from "./BigIntNumberInput";

type SetupOpts = {
  value?: NumberValue | null;
};

function setup({ value = null }: SetupOpts = {}) {
  const onChange = jest.fn();
  renderWithProviders(<BigIntNumberInput value={value} onChange={onChange} />);

  const input = screen.getByRole("textbox");
  return { input, onChange };
}

describe("BigIntNumberInput", () => {
  it("should display an empty value", () => {
    const { input } = setup({ value: null });
    expect(input).toHaveDisplayValue("");
  });

  it("should display an integer value", () => {
    const { input } = setup({ value: 10 });
    expect(input).toHaveDisplayValue("10");
  });

  it("should display a double value", () => {
    const { input } = setup({ value: 10.1 });
    expect(input).toHaveDisplayValue("10.1");
  });

  it("should display a bigint value", () => {
    const { input } = setup({ value: 9007199254740993n });
    expect(input).toHaveDisplayValue("9007199254740993");
  });

  it("should allow to enter an integer value", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "10");
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("should allow to enter a double value", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "10.1");
    expect(onChange).toHaveBeenLastCalledWith(10.1);
  });

  it("should allow to enter a bigint value", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "9007199254740993");
    expect(onChange).toHaveBeenLastCalledWith(9007199254740993n);
  });

  it("should allow to clear the value", async () => {
    const { input, onChange } = setup({ value: 9007199254740993n });
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
