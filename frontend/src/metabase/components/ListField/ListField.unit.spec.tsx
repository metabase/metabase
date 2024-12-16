import userEvent from "@testing-library/user-event";
import type { JSX } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
    <ListField
      value={value}
      options={options}
      optionRenderer={optionRenderer}
      placeholder={placeholder}
      checkedColor={checkedColor}
      isDashboardFilter={isDashboardFilter}
      onChange={onChange}
    />,
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

  it("should allow to select only visible options after search", async () => {
    const { onChange } = setup({
      value: ["Doohickey", "Gadget"],
      options: allOptions,
    });

    await userEvent.type(screen.getByPlaceholderText("Search the list"), "get");
    expect(screen.getByLabelText("Gadget")).toBeInTheDocument();
    expect(screen.getByLabelText("Widget")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByLabelText("Gizmo")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Doohickey")).not.toBeInTheDocument(),
    );

    const checkbox = screen.getByLabelText("Select these");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(["Doohickey", "Gadget", "Widget"]);
    expect(screen.getByLabelText("Gadget")).toBeChecked();
    expect(screen.getByLabelText("Widget")).toBeChecked();
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
      value: ["Doohickey", "Gadget", "Widget"],
      options: allOptions,
    });

    await userEvent.type(
      screen.getByPlaceholderText("Search the list"),
      "Gadget",
    );
    expect(screen.getByLabelText("Gadget")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByLabelText("Widget")).not.toBeInTheDocument(),
    );

    const checkbox = screen.getByLabelText("Select none");
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(["Doohickey", "Widget"]);
    expect(screen.getByLabelText("Gadget")).not.toBeChecked();
  });

  it("should not show the toggle all checkbox when search results are empty", async () => {
    setup({
      value: [],
      options: allOptions,
    });
    await userEvent.type(
      screen.getByPlaceholderText("Search the list"),
      "Invalid",
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Select none")).not.toBeInTheDocument(),
    );
  });
});
