import userEvent from "@testing-library/user-event";
import type { FieldValuesResult } from "metabase-types/api";
import { createMockFieldValues } from "metabase-types/api/mocks";
import {
  PEOPLE,
  PRODUCT_CATEGORY_VALUES,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import { act, renderWithProviders, screen } from "__support__/ui";
import {
  setupFieldSearchValuesEndpoints,
  setupFieldValuesEndpoints,
} from "__support__/server-mocks";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { StringFilterValuePicker } from "./FilterValuePicker";

interface SetupOpts<T> {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: T[];
  compact?: boolean;
  fieldValues?: FieldValuesResult;
  searchValues?: Record<string, FieldValuesResult>;
}

function setupStringPicker({
  query,
  stageIndex,
  column,
  values,
  compact,
  fieldValues,
  searchValues = {},
}: SetupOpts<string>) {
  const onChange = jest.fn();
  const onFocus = jest.fn();
  const onBlur = jest.fn();

  if (fieldValues) {
    setupFieldValuesEndpoints(fieldValues);
  }
  Object.entries(searchValues).forEach(([value, result]) => {
    setupFieldSearchValuesEndpoints(result.field_id, value, result.values);
  });

  renderWithProviders(
    <StringFilterValuePicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      values={values}
      compact={compact}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />,
  );

  return { onChange, onFocus, onBlur };
}

describe("StringFilterValuePicker", () => {
  const query = createQuery();
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);

  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe("list values", () => {
    const column = findColumn("PRODUCTS", "CATEGORY");

    it("should allow to pick a list value", async () => {
      const { onChange } = setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldValues: PRODUCT_CATEGORY_VALUES,
      });

      userEvent.click(await screen.findByText("Widget"));

      expect(onChange).toHaveBeenCalledWith(["Widget"]);
    });

    it("should handle empty field values", async () => {
      const { onChange, onFocus, onBlur } = setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldValues: createMockFieldValues({
          field_id: PRODUCTS.CATEGORY,
          values: [],
        }),
      });

      const input = await screen.findByLabelText("Filter value");
      expect(input).toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Search the list"),
      ).not.toBeInTheDocument();

      userEvent.type(input, "Test");
      userEvent.tab();
      expect(onFocus).toHaveBeenCalled();
      expect(onChange).toHaveBeenLastCalledWith(["Test"]);
      expect(onBlur).toHaveBeenCalled();
    });

    it("should handle more field values", async () => {
      const { onChange } = setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldValues: createMockFieldValues({
          field_id: PRODUCTS.CATEGORY,
          values: [["Gadget"], ["Widget"]],
          has_more_values: true,
        }),
        searchValues: {
          g: createMockFieldValues({
            field_id: PRODUCTS.CATEGORY,
            values: [["Gadget"], ["Gizmo"]],
            has_more_values: false,
          }),
        },
      });

      const input = await screen.findByPlaceholderText("Search by Category");
      expect(input).toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Search the list"),
      ).not.toBeInTheDocument();

      userEvent.type(input, "g");
      act(() => jest.advanceTimersByTime(1000));
      userEvent.click(await screen.findByText("Gizmo"));
      expect(onChange).toHaveBeenLastCalledWith(["Gizmo"]);
    });
  });

  describe("search values", () => {
    const column = findColumn("PEOPLE", "EMAIL");

    it("should allow to search for a value", async () => {
      const { onChange } = setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        searchValues: {
          a: createMockFieldValues({
            field_id: PEOPLE.EMAIL,
            values: [["a@metabase.test"]],
          }),
        },
      });

      userEvent.type(screen.getByPlaceholderText("Search by Email"), "a");
      act(() => jest.advanceTimersByTime(1000));
      userEvent.click(await screen.findByText("a@metabase.test"));

      expect(onChange).toHaveBeenLastCalledWith(["a@metabase.test"]);
    });
  });
});
