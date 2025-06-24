import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { FieldValue } from "metabase-types/api";
import { PRODUCT_CATEGORY_VALUES } from "metabase-types/api/mocks/presets";

import { ListValuePicker } from "./ListValuePicker";

type SetupOpts = {
  fieldValues?: FieldValue[];
  selectedValues?: string[];
  placeholder?: string;
  autoFocus?: boolean;
};

function setup({
  fieldValues = [],
  selectedValues = [],
  placeholder = "Search the list",
  autoFocus,
}: SetupOpts) {
  const onChange = jest.fn();

  renderWithProviders(
    <ListValuePicker
      fieldValues={fieldValues}
      selectedValues={selectedValues}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("ListValuePicker", () => {
  const allOptions = PRODUCT_CATEGORY_VALUES.values;
  const allValues = allOptions.map(([value]) => String(value));

  it("should allow to select all options", async () => {
    const { onChange } = setup({
      fieldValues: allOptions,
      selectedValues: [],
    });

    const checkbox = screen.getByLabelText("Select all");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(allValues);
  });

  it("should allow to select all options when some are selected", async () => {
    const { onChange } = setup({
      fieldValues: allOptions,
      selectedValues: [allValues[0]],
    });

    const checkbox = screen.getByLabelText("Select all");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(allValues);
  });

  it("should allow to select only visible options after search", async () => {
    const { onChange } = setup({
      fieldValues: allOptions,
      selectedValues: ["Doohickey", "Gadget"],
    });

    await userEvent.type(screen.getByPlaceholderText("Search the list"), "get");
    expect(screen.getByLabelText("Gadget")).toBeInTheDocument();
    expect(screen.getByLabelText("Widget")).toBeInTheDocument();
    expect(screen.queryByLabelText("Gizmo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Doohickey")).not.toBeInTheDocument();

    const checkbox = screen.getByLabelText("Select these");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(["Doohickey", "Gadget", "Widget"]);
  });

  it("should allow to deselect all options", async () => {
    const { onChange } = setup({
      fieldValues: allOptions,
      selectedValues: allValues,
    });

    const checkbox = screen.getByLabelText("Select all");
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("should allow to deselect only visible options after search", async () => {
    const { onChange } = setup({
      fieldValues: allOptions,
      selectedValues: ["Doohickey", "Gadget", "Widget"],
    });

    await userEvent.type(
      screen.getByPlaceholderText("Search the list"),
      "Gadget",
    );
    expect(screen.getByLabelText("Gadget")).toBeInTheDocument();
    expect(screen.queryByLabelText("Widget")).not.toBeInTheDocument();

    const checkbox = screen.getByLabelText("Select these");
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(["Doohickey", "Widget"]);
  });
});
