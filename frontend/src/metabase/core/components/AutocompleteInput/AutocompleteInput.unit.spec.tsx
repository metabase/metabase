import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AutocompleteInputProps } from "./AutocompleteInput";
import AutocompleteInput from "./AutocompleteInput";

const OPTIONS = ["Banana", "Orange", "Mango"];

const setup = ({
  onChange = jest.fn(),
  ...props
}: Partial<AutocompleteInputProps> = {}) => {
  const { rerender } = render(
    <AutocompleteInput {...props} options={OPTIONS} onChange={onChange} />,
  );

  const input = screen.getByRole("combobox");
  const getOptions = () => screen.findAllByRole("menuitem");

  return { input, getOptions, rerender };
};

describe("AutocompleteInput", () => {
  it("shows all options on focus", async () => {
    const { input, getOptions } = setup({ value: "" });

    await userEvent.click(input);

    const options = await getOptions();

    options.forEach((option, index) =>
      expect(option).toHaveTextContent(OPTIONS[index]),
    );
  });

  it("shows filter options", async () => {
    const { input, getOptions } = setup({
      value: "or",
    });

    await userEvent.click(input);

    const options = await getOptions();
    expect(options).toHaveLength(1);

    expect(options[0]).toHaveTextContent("Orange");
  });

  it("updates value on selecting an option", async () => {
    const onChange = jest.fn();
    const { input, getOptions } = setup({
      value: "or",
      onChange,
    });

    await userEvent.click(input);

    const options = await getOptions();

    await userEvent.click(options[0]);

    expect(onChange).toHaveBeenCalledWith("Orange");
  });

  it("supports custom filtering functions", async () => {
    const filterOptions = (value: string | undefined, options: string[]) => {
      if (value && options) {
        return options.filter(
          option =>
            !option.toLocaleLowerCase().includes(value.toLocaleLowerCase()),
        );
      }
      return [];
    };

    const { input, getOptions } = setup({
      value: "or",
      filterOptions,
    });

    await userEvent.click(input);

    const options = await getOptions();
    expect(options).toHaveLength(2);

    expect(options[0]).toHaveTextContent("Banana");
    expect(options[1]).toHaveTextContent("Mango");
  });

  it("supports independent option click handler", async () => {
    const onChange = jest.fn();
    const onOptionSelect = jest.fn();

    const { input, getOptions } = setup({
      value: "or",
      onChange,
      onOptionSelect,
    });

    await userEvent.click(input);

    const options = await getOptions();

    await userEvent.click(options[0]);

    expect(onOptionSelect).toHaveBeenCalledWith("Orange");
    expect(onChange).not.toHaveBeenCalled();
  });
});
