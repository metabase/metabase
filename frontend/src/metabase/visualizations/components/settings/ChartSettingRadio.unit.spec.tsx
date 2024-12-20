import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChartSettingRadio } from "./ChartSettingRadio";

const options = [
  { name: "Option 1", value: "value1" },
  { name: "Option 2", value: "value2" },
  { name: "No value", value: null },
];

describe("ChartSettingRadio", () => {
  it("should render all options", () => {
    render(
      <ChartSettingRadio
        options={options}
        value="value1"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
    expect(screen.getByText("No value")).toBeInTheDocument();
  });

  it("should handle string value selection", async () => {
    const onChange = jest.fn();
    render(
      <ChartSettingRadio
        options={options}
        value="value1"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByText("Option 2"));
    expect(onChange).toHaveBeenCalledWith("value2");
  });

  it("should handle null value selection", async () => {
    const onChange = jest.fn();
    render(
      <ChartSettingRadio
        options={options}
        value="value1"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByText("No value"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("should show null option as selected when value is null", () => {
    render(
      <ChartSettingRadio options={options} value={null} onChange={jest.fn()} />,
    );

    const nullOptionRadio = screen.getByLabelText("No value");
    const option1Radio = screen.getByLabelText("Option 1");

    expect(nullOptionRadio).toBeChecked();
    expect(option1Radio).not.toBeChecked();
  });
});
