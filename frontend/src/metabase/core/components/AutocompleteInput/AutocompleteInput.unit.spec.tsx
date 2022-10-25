import React from "react";
import { fireEvent, render } from "@testing-library/react";

import AutocompleteInput from "./AutocompleteInput";

const OPTIONS = ["Banana", "Orange", "Mango"];

interface setupProps {
  value?: string;
  onChange?: (value: string) => void;
  filterFn?: (value: string | undefined, options: string[]) => string[];
  onOptionClick?: (value: string) => void;
}

const setup = ({
  value = "",
  onChange = jest.fn(),
  filterFn,
  onOptionClick,
}: setupProps = {}) => {
  const { getByRole, rerender, findAllByRole } = render(
    <AutocompleteInput
      value={value}
      options={OPTIONS}
      onChange={onChange}
      filterFn={filterFn}
      onOptionClick={onOptionClick}
    />,
  );

  const input = getByRole("combobox");
  const getOptions = async () => findAllByRole("menuitem");

  return { input, getOptions, rerender };
};

describe("AutocompleteInput", () => {
  it("shows all options on focus", async () => {
    const { input, getOptions } = setup();

    fireEvent.focus(input);

    const options = await getOptions();

    options.forEach((option, index) =>
      expect(option).toHaveTextContent(OPTIONS[index]),
    );
  });

  it("shows filter options", async () => {
    const { input, getOptions } = setup({
      value: "or",
    });

    fireEvent.click(input);

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

    fireEvent.click(input);

    const options = await getOptions();

    fireEvent.click(options[0]);

    expect(onChange).toHaveBeenCalledWith("Orange");
  });

  it("supports custom filtering functions", async () => {
    const filterFn = (value: string | undefined, options: string[]) => {
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
      filterFn,
    });

    fireEvent.click(input);

    const options = await getOptions();
    expect(options).toHaveLength(2);

    expect(options[0]).toHaveTextContent("Banana");
    expect(options[1]).toHaveTextContent("Mango");
  });

  it("supports independent option click handler", async () => {
    const onChange = jest.fn();
    const onOptionClick = jest.fn();

    const { input, getOptions } = setup({
      value: "or",
      onChange,
      onOptionClick,
    });

    fireEvent.click(input);

    const options = await getOptions();

    fireEvent.click(options[0]);

    expect(onOptionClick).toHaveBeenCalledWith("Orange");
    expect(onChange).not.toHaveBeenCalled();
  });
});
