import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { ChartSettingTextarea } from "./ChartSettingTextarea";

type SetupOpts = {
  value?: string;
};

const setup = ({ value }: SetupOpts = {}) => {
  const onChange = jest.fn<void, [string]>();
  const { rerender } = render(
    <ChartSettingTextarea
      value={value}
      placeholder="No results"
      onChange={onChange}
    />,
  );
  return { onChange, rerender };
};

describe("ChartSettingTextarea", () => {
  it("should keep line breaks and call onChange once on blur", async () => {
    const { onChange } = setup();

    const textarea = screen.getByPlaceholderText("No results");
    await userEvent.type(textarea, "First line{enter}Second line");
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("First line\nSecond line");
  });

  it("should call onChange after typing stops without a blur", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const { onChange } = setup();

    await userEvent.type(screen.getByPlaceholderText("No results"), "Hello");
    expect(onChange).not.toHaveBeenCalled();

    jest.advanceTimersByTime(400);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Hello");
    jest.useRealTimers();
  });

  it.each([
    ["cleared", ""],
    ["left blank", "  {enter} "],
  ])(
    "should store an empty message when the field is %s",
    async (_label, text) => {
      const { onChange } = setup({ value: "Card message" });

      const textarea = screen.getByPlaceholderText("No results");
      await userEvent.clear(textarea);
      if (text) {
        await userEvent.type(textarea, text);
      }
      await userEvent.tab();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("");
    },
  );

  it("should not call onChange when blurred without changes", async () => {
    const { onChange } = setup({ value: "Card message" });

    await userEvent.click(screen.getByPlaceholderText("No results"));
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("should update when the value prop changes", () => {
    const { onChange, rerender } = setup({ value: "Old message" });

    rerender(
      <ChartSettingTextarea
        value="New message"
        placeholder="No results"
        onChange={onChange}
      />,
    );

    expect(screen.getByPlaceholderText("No results")).toHaveValue(
      "New message",
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
