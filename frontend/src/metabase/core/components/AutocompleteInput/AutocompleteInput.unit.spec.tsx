import React from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AutocompleteInput, { AutocompleteInputProps } from "./AutocompleteInput";

const OPTIONS = ["Banana", "Orange", "Mango"];

const setup = ({
  onChange = jest.fn(),
  ...props
}: Partial<AutocompleteInputProps> = {}) => {
  const { getByRole, rerender, findAllByRole } = render(
    <AutocompleteInput {...props} options={OPTIONS} onChange={onChange} />,
  );

  const input = getByRole("combobox");
  const getOptions = async () => findAllByRole("menuitem");

  return { input, getOptions, rerender };
};

describe("AutocompleteInput", () => {
  it("shows all options on focus", async () => {
    const { input, getOptions } = setup();

    userEvent.click(input);

    const options = await getOptions();

    options.forEach((option, index) =>
      expect(option).toHaveTextContent(OPTIONS[index]),
    );
  });

  it("shows filter options", async () => {
    const { input, getOptions } = setup({
      value: "or",
    });

    userEvent.click(input);

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

    userEvent.click(input);

    const options = await getOptions();

    userEvent.click(options[0]);

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

    userEvent.click(input);

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

    userEvent.click(input);

    const options = await getOptions();

    userEvent.click(options[0]);

    expect(onOptionSelect).toHaveBeenCalledWith("Orange");
    expect(onChange).not.toHaveBeenCalled();
  });
});
