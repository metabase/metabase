import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ChartSettingLinkUrlInput from "./ChartSettingLinkUrlInput";

const OPTIONS = [
  "ADDRESS",
  "EMAIL",
  "NAME",
  "CITY",
  "STATE",
  "SOURCE",
  "PASSWORD",
  "ZIP",
];

const setup = ({ onChange = jest.fn(), value = "", ...props } = {}) => {
  const { rerender } = render(
    <ChartSettingLinkUrlInput
      {...props}
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />,
  );

  const input = screen.getByRole("combobox");
  const getOptions = () => screen.findAllByRole("menuitem");

  return { input, getOptions, rerender };
};

describe("ChartSettingLinkUrlInput", () => {
  it("Shows all options when {{ is typed", async () => {
    const { input, getOptions } = setup();

    await userEvent.type(input, "USE - {{{{");

    const options = await getOptions();

    options.forEach((option, index) =>
      expect(option).toHaveTextContent(OPTIONS[index]),
    );
  });

  it("shows filter options while typing", async () => {
    const { input, getOptions } = setup();

    await userEvent.type(input, "USE - {{{{p");

    const options = await getOptions();

    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("PASSWORD");
    expect(options[1]).toHaveTextContent("ZIP");
  });

  it("shows filter options when clicked", async () => {
    const { input, getOptions } = setup({
      value: "USE - {{{{p",
    });

    await userEvent.click(input);

    const options = await getOptions();

    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("PASSWORD");
    expect(options[1]).toHaveTextContent("ZIP");
  });

  it("appends the column on selection", async () => {
    const onChange = jest.fn();
    const { input, getOptions } = setup({
      onChange,
    });

    await userEvent.type(input, "Address - {{{{p");

    const options = await getOptions();

    await userEvent.click(options[1]);
    input.blur();

    expect(onChange).toHaveBeenCalledWith("Address - {{ZIP}}");
  });

  it("supports keyboard navigation to choose selection", async () => {
    const onChange = jest.fn();
    const { input, getOptions } = setup({
      onChange,
    });

    await userEvent.type(input, "Address - {{{{p");

    const options = await getOptions();
    expect(options).toHaveLength(2);

    await userEvent.type(input, "{arrowdown}{arrowdown}{enter}");
    input.blur();

    expect(onChange).toHaveBeenCalledWith("Address - {{ZIP}}");
  });

  it("handles multiple variables in a single value", async () => {
    const onChange = jest.fn();

    const { input, getOptions } = setup({
      value: "{{STATE}} - ",
      onChange,
    });

    await userEvent.type(input, "{{{{c");

    const options = await getOptions();

    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("CITY");
    expect(options[1]).toHaveTextContent("SOURCE");

    await userEvent.click(options[0]);
    input.blur();

    expect(onChange).toHaveBeenCalledWith("{{STATE}} - {{CITY}}");
  });
});
