import React from "react";
import { fireEvent, render } from "@testing-library/react";

import AutocompleteInput from "./AutocompleteInput";

const OPTIONS = ["Banana", "Orange", "Mango"];

const setup = ({ value = "", onChange = jest.fn() } = {}) => {
  const { getByRole, rerender, findAllByRole } = render(
    <AutocompleteInput value={value} options={OPTIONS} onChange={onChange} />,
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
});
