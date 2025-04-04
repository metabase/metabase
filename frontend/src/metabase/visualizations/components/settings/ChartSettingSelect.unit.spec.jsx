import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { ChartSettingSelect } from "./ChartSettingSelect";

const options = [
  { name: "Option 1", value: "value1" },
  { name: "Option 2", value: "value2" },
  { name: "Boolean True", value: true },
  { name: "Boolean False", value: false },
  { name: "No value", value: null },
];

const selectOption = async (optionText) => {
  const select = screen.getByTestId("chart-setting-select");
  await userEvent.click(select);
  const option = screen.getByText(optionText);
  await userEvent.click(option);
};

describe("ChartSettingSelect", () => {
  it("should render all options", async () => {
    render(
      <ChartSettingSelect
        options={options}
        value="value1"
        onChange={() => undefined}
      />,
    );

    const select = screen.getByTestId("chart-setting-select");
    await userEvent.click(select);

    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
    expect(screen.getByText("Boolean True")).toBeInTheDocument();
    expect(screen.getByText("Boolean False")).toBeInTheDocument();
    expect(screen.getByText("No value")).toBeInTheDocument();
  });

  it("should handle string value selection", async () => {
    const onChange = jest.fn();
    render(
      <ChartSettingSelect
        options={options}
        value="value1"
        onChange={onChange}
      />,
    );

    await selectOption("Option 2");
    expect(onChange).toHaveBeenCalledWith("value2");
  });

  it("should handle boolean value selection", async () => {
    const onChange = jest.fn();
    render(
      <ChartSettingSelect
        options={options}
        value="value1"
        onChange={onChange}
      />,
    );

    await selectOption("Boolean True");
    expect(onChange).toHaveBeenCalledWith(true);

    await selectOption("Boolean False");
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("should handle null value selection", async () => {
    const onChange = jest.fn();
    render(
      <ChartSettingSelect
        options={options}
        value="value1"
        onChange={onChange}
      />,
    );

    await selectOption("No value");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("should show correct option as selected", () => {
    const { rerender } = render(
      <ChartSettingSelect
        options={options}
        value={null}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("No value")).toBeInTheDocument();

    rerender(
      <ChartSettingSelect
        options={options}
        value={true}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("Boolean True")).toBeInTheDocument();

    rerender(
      <ChartSettingSelect
        options={options}
        value={false}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("Boolean False")).toBeInTheDocument();
  });

  it("should disable select when there are no options", () => {
    render(<ChartSettingSelect options={[]} onChange={jest.fn()} />);
    expect(screen.getByTestId("chart-setting-select")).toBeDisabled();
  });

  it("should disable select when there is only one option matching the current value", () => {
    render(
      <ChartSettingSelect
        options={[{ name: "Option 1", value: "value1" }]}
        value="value1"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId("chart-setting-select")).toBeDisabled();
  });
});
