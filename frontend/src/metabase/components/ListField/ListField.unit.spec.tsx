import userEvent from "@testing-library/user-event";
import type { JSX } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { waitTimeContext } from "metabase/context/wait-time";
import type { RowValue } from "metabase-types/api";
import { PRODUCT_CATEGORY_VALUES } from "metabase-types/api/mocks/presets";

import { ListField } from "./ListField";
import type { Option } from "./types";

type SetupOpts = {
  value?: RowValue[];
  options?: Option[];
  optionRenderer?: (option: Option) => JSX.Element;
  placeholder?: string;
  checkedColor?: string;
  isDashboardFilter?: boolean;
};

function setup({
  value = [],
  options = [],
  optionRenderer = ([value]) => value,
  placeholder = "Search the list",
  checkedColor,
  isDashboardFilter,
}: SetupOpts) {
  const onChange = jest.fn();

  renderWithProviders(
    <waitTimeContext.Provider value={0}>
      <ListField
        value={value}
        options={options}
        optionRenderer={optionRenderer}
        placeholder={placeholder}
        checkedColor={checkedColor}
        isDashboardFilter={isDashboardFilter}
        onChange={onChange}
      />
      ,
    </waitTimeContext.Provider>,
  );

  return { onChange };
}

describe("ListField", () => {
  const allOptions = PRODUCT_CATEGORY_VALUES.values;
  const allValues = allOptions.map(([value]) => String(value));

  it("should allow to select all options", async () => {
    const { onChange } = setup({
      value: [],
      options: allOptions,
    });

    const checkbox = screen.getByLabelText("Select all");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(allValues);
  });

  it("should allow to select all options when some are selected", async () => {
    const { onChange } = setup({
      value: [allValues[0]],
      options: allOptions,
    });

    const checkbox = screen.getByLabelText("Select all");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(allValues);
  });

  it("should allow to select all options after search", async () => {
    const { onChange } = setup({
      value: [],
      options: allOptions,
    });

    await userEvent.type(
      screen.getByPlaceholderText("Search the list"),
      allValues[0],
    );
    expect(screen.getByLabelText(allValues[0])).toBeInTheDocument();
    expect(screen.queryByLabelText(allValues[1])).not.toBeInTheDocument();

    const checkbox = screen.getByLabelText("Select all");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(allValues);
  });

  it("should allow to deselect all options", async () => {
    const { onChange } = setup({
      value: allValues,
      options: allOptions,
    });

    const checkbox = screen.getByLabelText("Select none");
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("should allow to deselect all options after search", async () => {
    const { onChange } = setup({
      value: allValues,
      options: allOptions,
    });

    await userEvent.type(
      screen.getByPlaceholderText("Search the list"),
      allValues[0],
    );
    expect(screen.getByLabelText(allValues[0])).toBeInTheDocument();
    expect(screen.queryByLabelText(allValues[1])).not.toBeInTheDocument();

    const checkbox = screen.getByLabelText("Select none");
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
