import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen } from "__support__/ui";

import { ChartSettingNumberInput } from "./ChartSettingNumberInput";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

type SetupOpts = {
  value?: number;
};

function setup({ value }: SetupOpts = {}) {
  const onChange = jest.fn<void, [number | null | undefined]>();
  renderWithProviders(
    <ChartSettingNumberInput
      value={value}
      onChange={onChange}
      min={0}
      max={20}
    />,
  );
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  return { input: screen.getByRole("textbox"), onChange, user };
}

describe("ChartSettingNumberInput", () => {
  it("saves a typed multi-digit value once, not on every keystroke", async () => {
    const { input, onChange, user } = setup({ value: 3 });

    await user.clear(input);
    await user.type(input, "12");
    expect(onChange).not.toHaveBeenCalled();

    act(() => jest.runAllTimers());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it("saves the pending value immediately on blur", async () => {
    const { input, onChange, user } = setup({ value: 3 });

    await user.clear(input);
    await user.type(input, "5");
    await user.tab();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(5);

    act(() => jest.runAllTimers());
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated steps into one save", async () => {
    const { input, onChange, user } = setup({ value: 3 });

    await user.click(input);
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    await user.tab();

    expect(input).toHaveDisplayValue("6");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("saves the clamped value when an out-of-range value is blurred", async () => {
    const { input, onChange, user } = setup({ value: 3 });

    await user.clear(input);
    await user.type(input, "25");
    await user.tab();

    expect(input).toHaveDisplayValue("20");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it("restores the default by saving undefined when cleared", async () => {
    const { input, onChange, user } = setup({ value: 3 });

    await user.clear(input);
    await user.tab();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("does not save when the value is unchanged", async () => {
    const { input, onChange, user } = setup({ value: 3 });

    await user.click(input);
    await user.tab();
    act(() => jest.runAllTimers());

    expect(onChange).not.toHaveBeenCalled();
  });
});
