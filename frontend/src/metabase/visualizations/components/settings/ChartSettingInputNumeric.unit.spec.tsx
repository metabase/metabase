import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen } from "__support__/ui";

import { ChartSettingInputNumeric } from "./ChartSettingInputNumeric";

function setup({
  value,
}: {
  value?: number;
} = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <ChartSettingInputNumeric
      value={value}
      onChange={onChange}
      onChangeSettings={() => null}
    />,
  );

  const input = screen.getByRole("textbox");

  return { input, onChange };
}

async function type({ input, value }: { input: HTMLElement; value: string }) {
  await userEvent.clear(input);
  await userEvent.type(input, value);
  fireEvent.blur(input);
}

describe("ChartSettingInputNumber", () => {
  it("allows integer values", async () => {
    const { input, onChange } = setup();

    await type({ input, value: "123" });
    expect(input).toHaveDisplayValue("123");
    expect(onChange).toHaveBeenCalledWith(123);

    await type({ input, value: "-456" });
    expect(input).toHaveDisplayValue("-456");
    expect(onChange).toHaveBeenCalledWith(-456);
  });

  it("allows decimal values", async () => {
    const { input, onChange } = setup();

    await type({ input, value: "1.23" });
    expect(input).toHaveDisplayValue("1.23");
    expect(onChange).toHaveBeenCalledWith(1.23);

    await type({ input, value: "-4.56" });
    expect(input).toHaveDisplayValue("-4.56");
    expect(onChange).toHaveBeenCalledWith(-4.56);

    // multiple decimal places should call onChange with
    // undefined since it's an invalid value
    await type({ input, value: "1.2.3" });
    expect(input).toHaveDisplayValue("1.2.3");
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("allows scientific notation", async () => {
    const { input, onChange } = setup();

    await type({ input, value: "1.5e3" });
    expect(input).toHaveDisplayValue("1.5e3");
    expect(onChange).toHaveBeenCalledWith(1.5e3);
  });

  it("does not allow non-numeric values", async () => {
    const { input, onChange } = setup();

    await type({ input, value: "asdf" });
    expect(input).toHaveDisplayValue("");
    expect(onChange).toHaveBeenCalledWith(undefined);

    // Inputs with `e` that are not valid scientific notation
    type({ input, value: "e123" });
    expect(input).toHaveDisplayValue("");
    expect(onChange).toHaveBeenCalledWith(undefined);

    type({ input, value: "e123e" });
    expect(input).toHaveDisplayValue("");
    expect(onChange).toHaveBeenCalledWith(undefined);

    type({ input, value: "1e23e" });
    expect(input).toHaveDisplayValue("");
    expect(onChange).toHaveBeenCalledWith(undefined);

    type({ input, value: "e1e23e" });
    expect(input).toHaveDisplayValue("");
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("renders the `value` prop on load", () => {
    const { input } = setup({ value: 123 });

    expect(input).toHaveDisplayValue("123");
  });
});
