import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { FieldValue } from "metabase-types/api";
import { PRODUCT_CATEGORY_VALUES } from "metabase-types/api/mocks/presets";

import { ListValuePicker } from "./ListValuePicker";

type SetupOpts = {
  fieldValues?: FieldValue[];
  selectedValues?: string[];
  placeholder?: string;
  shouldCreate?: (query: string, values: string[]) => boolean;
  autoFocus?: boolean;
  compact?: boolean;
};

function setup({
  fieldValues = [],
  selectedValues = [],
  placeholder = "Search the list",
  shouldCreate,
  autoFocus,
  compact,
}: SetupOpts) {
  const onChange = jest.fn();
  const onFocus = jest.fn();
  const onBlur = jest.fn();

  renderWithProviders(
    <ListValuePicker
      fieldValues={fieldValues}
      selectedValues={selectedValues}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      autoFocus={autoFocus}
      compact={compact}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />,
  );

  return { onChange, onFocus, onBlur };
}

describe("ListValuePicker", () => {
  describe("checkbox list mode", () => {
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

    it("should allow to select all options after search", async () => {
      const { onChange } = setup({
        fieldValues: allOptions,
        selectedValues: [],
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
        fieldValues: allOptions,
        selectedValues: allValues,
      });

      const checkbox = screen.getByLabelText("Select none");
      expect(checkbox).toBeChecked();
      await userEvent.click(checkbox);

      expect(onChange).toHaveBeenCalledWith([]);
    });

    it("should allow to deselect all options after search", async () => {
      const { onChange } = setup({
        fieldValues: allOptions,
        selectedValues: allValues,
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
});
