import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { ChartSettingSegmentedControl } from "./ChartSettingSegmentedControl";

const defaultOptions = [
  { name: "Option 1", value: "value1" },
  { name: "Option 2", value: "value2" },
  { name: "Option 3", value: "value3" },
];

function setup() {
  const value = "value1";
  const onChange = jest.fn();
  render(
    <ChartSettingSegmentedControl
      options={defaultOptions}
      value={value}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("ChartSettingSegmentedControl", () => {
  it("should render all options", () => {
    setup();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(defaultOptions.length);

    defaultOptions.forEach((option, index) => {
      expect(buttons[index]).toHaveTextContent(option.name);
    });
  });

  it("should call onChange when clicking an option", async () => {
    const { onChange } = setup();
    const user = userEvent.setup();

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[1]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(defaultOptions[1].value);
  });

  it("should handle keyboard navigation and selection", async () => {
    const { onChange } = setup();

    const buttons = screen.getAllByRole("button");
    await userEvent.tab();
    expect(buttons[0]).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(defaultOptions[0].value);

    await userEvent.tab();
    expect(buttons[1]).toHaveFocus();

    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(defaultOptions[1].value);
  });
});
