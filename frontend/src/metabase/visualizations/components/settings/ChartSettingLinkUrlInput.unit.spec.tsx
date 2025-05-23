import userEvent from "@testing-library/user-event";

import { act, render, screen } from "__support__/ui";

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

const setup = ({ value = "", ...props } = {}) => {
  const onChange = jest.fn();

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

  return { input, getOptions, rerender, onChange };
};

describe("ChartSettingLinkUrlInput", () => {
  it("Shows all options when {{ is typed", async () => {
    const { input, getOptions } = setup();

    await userEvent.click(input);
    await userEvent.paste("USE - {{");

    const options = await getOptions();

    options.forEach((option, index) =>
      expect(option).toHaveTextContent(OPTIONS[index]),
    );
  });

  it("shows filter options while typing", async () => {
    const { input, getOptions } = setup();
    await userEvent.click(input);
    await userEvent.paste("USE - {{p");

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
    const { input, getOptions, onChange } = setup();

    await userEvent.click(input);
    await userEvent.paste("Address - {{p");

    const options = await getOptions();

    await userEvent.click(options[1]);
    act(() => {
      input.blur();
    });

    expect(onChange).toHaveBeenCalledWith("Address - {{ZIP}}");
  });

  it("supports keyboard navigation to choose selection", async () => {
    const { input, getOptions, onChange } = setup();

    await userEvent.click(input);
    await userEvent.paste("Address - {{p");

    const options = await getOptions();
    expect(options).toHaveLength(2);

    await userEvent.keyboard("{arrowdown}");
    await userEvent.keyboard("{arrowdown}");
    await userEvent.keyboard("{enter}");

    act(() => {
      input.blur();
    });

    expect(onChange).toHaveBeenCalledWith("Address - {{ZIP}}");
  });

  it("handles multiple variables in a single value", async () => {
    const { input, getOptions, onChange } = setup({
      value: "{{STATE}} - ",
    });

    await userEvent.click(input);
    await userEvent.paste("{{c");

    const options = await getOptions();

    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("CITY");
    expect(options[1]).toHaveTextContent("SOURCE");

    await userEvent.click(options[0]);
    act(() => {
      input.blur();
    });

    expect(onChange).toHaveBeenCalledWith("{{STATE}} - {{CITY}}");
  });

  it("should correctly reset the input value when re-rendered with the same empty value", async () => {
    const { input, rerender, onChange } = setup({
      value: "",
    });
    await userEvent.type(input, "abc");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith("abc");
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(
      <ChartSettingLinkUrlInput
        value=""
        options={OPTIONS}
        onChange={onChange}
      />,
    );
    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
