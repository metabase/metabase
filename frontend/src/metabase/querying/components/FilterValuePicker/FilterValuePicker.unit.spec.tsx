import userEvent from "@testing-library/user-event";
import type { FieldValuesResult } from "metabase-types/api";
import { createMockFieldValues } from "metabase-types/api/mocks";
import {
  PEOPLE,
  PRODUCT_CATEGORY_VALUES,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import {
  act,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
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

async function setup({
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

  await waitForLoaderToBeRemoved();

  return { onChange, onFocus, onBlur };
}

describe("FilterValuePicker", () => {
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
      const { onChange } = await setup({
        query,
        stageIndex,
        column,
        values: [],
        fieldValues: PRODUCT_CATEGORY_VALUES,
      });

      userEvent.click(screen.getByText("Widget"));

      expect(onChange).toHaveBeenCalledWith(["Widget"]);
    });

    it("should allow to search the list of values", async () => {
      const { onChange } = await setup({
        query,
        stageIndex,
        column,
        values: [],
        fieldValues: PRODUCT_CATEGORY_VALUES,
      });

      userEvent.type(screen.getByPlaceholderText("Search the list"), "G");
      expect(screen.getByText("Gadget")).toBeInTheDocument();
      expect(screen.queryByText("Doohickey")).not.toBeInTheDocument();

      userEvent.click(screen.getByText("Gadget"));
      expect(onChange).toHaveBeenCalledWith(["Gadget"]);
    });

    it("should display selected values", async () => {
      await setup({
        query,
        stageIndex,
        column,
        values: ["Gadget"],
        fieldValues: PRODUCT_CATEGORY_VALUES,
      });

      expect(screen.getByRole("checkbox", { name: "Gadget" })).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Widget" }),
      ).not.toBeChecked();
    });

    it("should display selected values even if they do not exist in the list", async () => {
      await setup({
        query,
        stageIndex,
        column,
        values: ["Test"],
        fieldValues: PRODUCT_CATEGORY_VALUES,
      });
      expect(screen.getByRole("checkbox", { name: "Test" })).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Gadget" }),
      ).not.toBeChecked();

      userEvent.type(screen.getByPlaceholderText("Search the list"), "T");
      expect(screen.getByText("Test")).toBeInTheDocument();
      expect(screen.getByText("Gadget")).toBeInTheDocument();
      expect(screen.queryByText("Gizmo")).not.toBeInTheDocument();
    });

    it("should handle field values remapping", async () => {
      const { onChange } = await setup({
        query,
        stageIndex,
        column,
        values: ["t"],
        fieldValues: createMockFieldValues({
          field_id: PRODUCTS.CATEGORY,
          values: [
            ["t", "To-do"],
            ["p", "In-progress"],
            ["c", "Completed"],
          ],
        }),
      });
      expect(screen.getByRole("checkbox", { name: "To-do" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "To-do" })).toBeChecked();

      userEvent.type(screen.getByPlaceholderText("Search the list"), "in");
      expect(screen.getByText("In-progress")).toBeInTheDocument();
      expect(screen.queryByText("Completed")).not.toBeInTheDocument();

      userEvent.click(screen.getByText("In-progress"));
      expect(onChange).toHaveBeenCalledWith(["t", "p"]);
    });

    it("should handle empty field values", async () => {
      const { onChange, onFocus, onBlur } = await setup({
        query,
        stageIndex,
        column,
        values: [],
        fieldValues: createMockFieldValues({
          field_id: PRODUCTS.CATEGORY,
          values: [],
        }),
      });

      const input = screen.getByLabelText("Filter value");
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
      const { onChange } = await setup({
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

      const input = screen.getByPlaceholderText("Search by Category");
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
      const { onChange } = await setup({
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

    it("should handle field values remapping", async () => {
      const { onChange } = await setup({
        query,
        stageIndex,
        column,
        values: [],
        searchValues: {
          a: createMockFieldValues({
            field_id: PEOPLE.EMAIL,
            values: [["a-test", "a@metabase.test"]],
          }),
        },
      });

      userEvent.type(screen.getByPlaceholderText("Search by Email"), "a");
      act(() => jest.advanceTimersByTime(1000));
      userEvent.click(await screen.findByText("a@metabase.test"));

      expect(onChange).toHaveBeenLastCalledWith(["a-test"]);
    });
  });
});
