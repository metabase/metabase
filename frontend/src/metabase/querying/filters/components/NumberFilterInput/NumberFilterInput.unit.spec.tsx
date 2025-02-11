import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { NumberFilterInput, type NumberFilterValue } from "./NumberFilterInput";

type SetupOpts = {
  value?: NumberFilterValue | "";
};

function setup({ value = "" }: SetupOpts = {}) {
  const onChange = jest.fn();
  renderWithProviders(<NumberFilterInput value={value} onChange={onChange} />);

  const input = screen.getByRole("textbox");
  return { input, onChange };
}

describe("NumberFilterInput", () => {
  it("should allow to enter an integer value", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "10");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("should allow to enter a double value", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "10.1");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith(10.1);
  });

  it("should allow to enter a bigint value", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "9007199254740993");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith("9007199254740993");
  });
});
