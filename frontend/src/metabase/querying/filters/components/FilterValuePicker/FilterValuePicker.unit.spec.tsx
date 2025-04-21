import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupFieldSearchValuesEndpoint,
  setupFieldValuesEndpoint,
  setupRemappedFieldValueEndpoint,
} from "__support__/server-mocks";
import {
  createMockClipboardData,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  SAMPLE_METADATA,
  columnFinder,
  createQuery,
} from "metabase-lib/test-helpers";
import type {
  FieldId,
  FieldValue,
  GetFieldValuesResponse,
} from "metabase-types/api";
import {
  createMockFieldDimension,
  createMockFieldValues,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  PEOPLE,
  PRODUCTS,
  PRODUCT_CATEGORY_VALUES,
  createOrdersProductIdField,
  createPeopleIdField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  NumberFilterValuePicker,
  StringFilterValuePicker,
} from "./FilterValuePicker";

type EndpointOpts = {
  fieldId?: FieldId;
  searchFieldId?: FieldId;
  fieldValues?: GetFieldValuesResponse;
  searchValues?: Record<string, GetFieldValuesResponse>;
  remappedValues?: Record<string, FieldValue>;
};

function setupEndpoints({
  fieldId,
  searchFieldId = fieldId,
  fieldValues,
  searchValues = {},
  remappedValues = {},
}: EndpointOpts) {
  if (fieldValues) {
    setupFieldValuesEndpoint(fieldValues);
  }
  if (fieldId != null && searchFieldId != null) {
    Object.entries(searchValues).forEach(([value, response]) => {
      setupFieldSearchValuesEndpoint(
        fieldId,
        searchFieldId,
        value,
        response.values,
      );
    });
    Object.entries(remappedValues).forEach(([value, fieldValue]) => {
      setupRemappedFieldValueEndpoint(
        fieldId,
        searchFieldId,
        value,
        fieldValue,
      );
    });
  }
}

interface SetupOpts<T> {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: T[];
  fieldId?: FieldId;
  searchFieldId?: FieldId;
  fieldValues?: GetFieldValuesResponse;
  searchValues?: Record<string, GetFieldValuesResponse>;
  remappedValues?: Record<string, FieldValue>;
}

async function setupStringPicker({
  query,
  stageIndex,
  column,
  values,
  fieldId,
  searchFieldId = fieldId,
  fieldValues,
  searchValues = {},
  remappedValues = {},
}: SetupOpts<string>) {
  const onChange = jest.fn();

  setupEndpoints({
    fieldId,
    searchFieldId,
    fieldValues,
    searchValues,
    remappedValues,
  });

  const { rerender } = renderWithProviders(
    <StringFilterValuePicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      values={values}
      onChange={onChange}
    />,
  );

  await waitForLoaderToBeRemoved();

  return { rerender, onChange };
}

async function setupNumberPicker({
  query,
  stageIndex,
  column,
  values,
  fieldId,
  searchFieldId = fieldId,
  fieldValues,
  searchValues = {},
  remappedValues = {},
}: SetupOpts<number>) {
  const onChange = jest.fn();

  setupEndpoints({
    fieldId,
    searchFieldId,
    fieldValues,
    searchValues,
    remappedValues,
  });

  const { rerender } = renderWithProviders(
    <NumberFilterValuePicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      values={values}
      onChange={onChange}
    />,
  );

  await waitForLoaderToBeRemoved();

  return { rerender, onChange };
}

describe("StringFilterValuePicker", () => {
  const { query, stageIndex, findColumn } = createQueryWithMetadata();

  describe("list values", () => {
    const column = findColumn("PRODUCTS", "CATEGORY");
    const fieldId = PRODUCTS.CATEGORY;

    it("should allow to pick a list value", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        fieldValues: PRODUCT_CATEGORY_VALUES,
      });

      await userEvent.click(screen.getByText("Widget"));

      expect(onChange).toHaveBeenCalledWith(["Widget"]);
    });

    it("should allow to search the list of values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        fieldValues: PRODUCT_CATEGORY_VALUES,
      });

      await userEvent.type(screen.getByPlaceholderText("Search the list"), "G");
      expect(screen.getByText("Gadget")).toBeInTheDocument();
      expect(screen.queryByText("Doohickey")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Gadget"));
      expect(onChange).toHaveBeenCalledWith(["Gadget"]);
    });

    it("should allow to update selected values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["Gadget"],
        fieldId,
        fieldValues: PRODUCT_CATEGORY_VALUES,
      });
      expect(screen.getByRole("checkbox", { name: "Gadget" })).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Widget" }),
      ).not.toBeChecked();

      await userEvent.click(screen.getByText("Widget"));
      expect(onChange).toHaveBeenCalledWith(["Gadget", "Widget"]);
    });

    it("should handle values that do not exist in the list", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["Test"],
        fieldId,
        fieldValues: PRODUCT_CATEGORY_VALUES,
      });
      expect(screen.getByRole("checkbox", { name: "Test" })).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Gadget" }),
      ).not.toBeChecked();

      await userEvent.type(screen.getByPlaceholderText("Search the list"), "T");
      expect(screen.getByText("Test")).toBeInTheDocument();
      expect(screen.getByText("Gadget")).toBeInTheDocument();
      expect(screen.queryByText("Gizmo")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Gadget"));
      expect(onChange).toHaveBeenCalledWith(["Test", "Gadget"]);
    });

    it("should handle type/PK -> type/Name field values remapping", async () => {
      const metadata = createMockMetadata({
        databases: [createSampleDatabase()],
        fields: [
          createPeopleIdField({
            base_type: "type/Text",
            effective_type: "type/Text",
            has_field_values: "list",
          }),
        ],
      });
      const { query, stageIndex, findColumn } =
        createQueryWithMetadata(metadata);
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "ID"),
        values: ["1"],
        fieldId: PEOPLE.ID,
        searchFieldId: PEOPLE.NAME,
        fieldValues: createMockFieldValues({
          field_id: PEOPLE.ID,
          values: [
            ["1", "A"],
            ["2", "B"],
            ["3", "C"],
          ],
        }),
      });
      expect(screen.getByRole("checkbox", { name: "A" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "B" })).not.toBeChecked();

      await userEvent.type(screen.getByPlaceholderText("Search the list"), "B");
      expect(screen.getByText("B")).toBeInTheDocument();
      expect(screen.queryByText("C")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("B"));
      expect(onChange).toHaveBeenCalledWith(["1", "2"]);
    });

    it("should handle type/FK -> column field values remapping", async () => {
      const metadata = createMockMetadata({
        databases: [createSampleDatabase()],
        fields: [
          createOrdersProductIdField({
            base_type: "type/Text",
            effective_type: "type/Text",
            dimensions: [
              createMockFieldDimension({
                human_readable_field_id: PRODUCTS.TITLE,
              }),
            ],
            has_field_values: "list",
          }),
        ],
      });
      const { query, stageIndex, findColumn } =
        createQueryWithMetadata(metadata);
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column: findColumn("ORDERS", "PRODUCT_ID"),
        values: ["1"],
        fieldId: ORDERS.PRODUCT_ID,
        searchFieldId: PRODUCTS.TITLE,
        fieldValues: createMockFieldValues({
          field_id: ORDERS.PRODUCT_ID,
          values: [
            ["1", "A"],
            ["2", "B"],
            ["3", "C"],
          ],
        }),
      });
      expect(screen.getByRole("checkbox", { name: "A" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "B" })).not.toBeChecked();

      await userEvent.type(screen.getByPlaceholderText("Search the list"), "B");
      expect(screen.getByText("B")).toBeInTheDocument();
      expect(screen.queryByText("C")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("B"));
      expect(onChange).toHaveBeenCalledWith(["1", "2"]);
    });

    it("should handle custom field values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["t"],
        fieldId,
        fieldValues: createMockFieldValues({
          field_id: fieldId,
          values: [
            ["t", "To-do"],
            ["p", "In-progress"],
            ["c", "Completed"],
          ],
        }),
      });
      expect(screen.getByRole("checkbox", { name: "To-do" })).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "In-progress" }),
      ).not.toBeChecked();

      await userEvent.type(
        screen.getByPlaceholderText("Search the list"),
        "in",
      );
      expect(screen.getByText("In-progress")).toBeInTheDocument();
      expect(screen.queryByText("Completed")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("In-progress"));
      expect(onChange).toHaveBeenCalledWith(["t", "p"]);
    });

    it("should elevate selected field values on initial render", async () => {
      await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["p"],
        fieldId,
        fieldValues: createMockFieldValues({
          field_id: fieldId,
          values: [
            ["t", "To-do"],
            ["p", "In-progress"],
            ["c", "Completed"],
          ],
        }),
      });

      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes[0]).toHaveAccessibleName("Select all");
      expect(checkboxes[1]).toHaveAccessibleName("In-progress");
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).toHaveAccessibleName("To-do");
      expect(checkboxes[2]).not.toBeChecked();
      expect(checkboxes[3]).toHaveAccessibleName("Completed");
      expect(checkboxes[3]).not.toBeChecked();
    });

    it("should not elevate selected field values after checking an item", async () => {
      const { rerender, onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["p"],
        fieldId,
        fieldValues: createMockFieldValues({
          field_id: fieldId,
          values: [
            ["t", "To-do"],
            ["p", "In-progress"],
            ["c", "Completed"],
          ],
        }),
      });

      rerender(
        <StringFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={["p", "c"]}
          onChange={onChange}
        />,
      );
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes[0]).toHaveAccessibleName("Select all");
      expect(checkboxes[1]).toHaveAccessibleName("In-progress");
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).toHaveAccessibleName("To-do");
      expect(checkboxes[2]).not.toBeChecked();
      expect(checkboxes[3]).toHaveAccessibleName("Completed");
      expect(checkboxes[3]).toBeChecked();
    });

    it("should not elevate selected field values after unchecking an item", async () => {
      const { rerender, onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["p", "c"],
        fieldId,
        fieldValues: createMockFieldValues({
          field_id: fieldId,
          values: [
            ["t", "To-do"],
            ["p", "In-progress"],
            ["c", "Completed"],
          ],
        }),
      });

      rerender(
        <StringFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={["c"]}
          onChange={onChange}
        />,
      );
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes[0]).toHaveAccessibleName("Select all");
      expect(checkboxes[1]).toHaveAccessibleName("In-progress");
      expect(checkboxes[1]).not.toBeChecked();
      expect(checkboxes[2]).toHaveAccessibleName("Completed");
      expect(checkboxes[2]).toBeChecked();
      expect(checkboxes[3]).toHaveAccessibleName("To-do");
      expect(checkboxes[3]).not.toBeChecked();
    });

    it("should handle empty field values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        fieldValues: createMockFieldValues({
          field_id: fieldId,
          values: [],
        }),
      });

      const input = screen.getByRole("combobox", { name: "Filter value" });
      expect(input).toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Search the list"),
      ).not.toBeInTheDocument();

      await userEvent.type(input, "Test");
      await userEvent.tab();
      expect(onChange).toHaveBeenLastCalledWith(["Test"]);
    });

    it("should ignore null field values", async () => {
      await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        fieldValues: createMockFieldValues({
          field_id: fieldId,
          values: [[null], ["Widget"]],
        }),
      });

      expect(
        screen.getByRole("checkbox", { name: "Widget" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: "null" }),
      ).not.toBeInTheDocument();
    });

    it("should handle more field values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        fieldValues: createMockFieldValues({
          field_id: fieldId,
          values: [["Gadget"], ["Widget"]],
          has_more_values: true,
        }),
        searchValues: {
          g: createMockFieldValues({
            field_id: fieldId,
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

      await userEvent.click(input);
      expect(screen.getByText("Gadget")).toBeInTheDocument();
      expect(screen.getByText("Widget")).toBeInTheDocument();

      await userEvent.type(input, "g");
      await userEvent.click(await screen.findByText("Gizmo"));
      expect(onChange).toHaveBeenLastCalledWith(["Gizmo"]);
    });
  });

  describe("search values", () => {
    const column = findColumn("PEOPLE", "EMAIL");
    const fieldId = PEOPLE.EMAIL;

    it("should allow to search for a value", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        searchValues: {
          a: createMockFieldValues({
            field_id: fieldId,
            values: [["a@metabase.test"]],
          }),
        },
      });

      await userEvent.type(screen.getByPlaceholderText("Search by Email"), "a");
      await userEvent.click(await screen.findByText("a@metabase.test"));

      expect(onChange).toHaveBeenLastCalledWith(["a@metabase.test"]);
    });

    it("should show an empty state message", async () => {
      await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        searchValues: {
          a: createMockFieldValues({
            field_id: fieldId,
            values: [["a@metabase.test"]],
          }),
          ac: createMockFieldValues({
            field_id: fieldId,
            values: [],
          }),
        },
      });

      await userEvent.type(screen.getByPlaceholderText("Search by Email"), "a");
      expect(await screen.findByText("a@metabase.test")).toBeInTheDocument();

      await userEvent.type(screen.getByPlaceholderText("Search by Email"), "c");
      expect(
        await screen.findByText("No matching Email found."),
      ).toBeInTheDocument();
    });

    it("should allow to update selected values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["b@metabase.test"],
        fieldId,
        searchValues: {
          a: createMockFieldValues({
            field_id: fieldId,
            values: [["a@metabase.test"]],
          }),
        },
      });
      expect(screen.getByText("b@metabase.test")).toBeInTheDocument();

      await userEvent.type(
        screen.getByRole("combobox", { name: "Filter value" }),
        "a",
      );
      await userEvent.click(await screen.findByText("a@metabase.test"));

      expect(onChange).toHaveBeenLastCalledWith([
        "b@metabase.test",
        "a@metabase.test",
      ]);
    });

    it("should handle type/PK -> type/Name field values remapping", async () => {
      const metadata = createMockMetadata({
        databases: [createSampleDatabase()],
        fields: [
          createPeopleIdField({
            base_type: "type/Text",
            effective_type: "type/Text",
            has_field_values: "search",
          }),
        ],
      });
      const { query, stageIndex, findColumn } =
        createQueryWithMetadata(metadata);
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "ID"),
        values: ["b"],
        fieldId: PEOPLE.ID,
        searchFieldId: PEOPLE.NAME,
        searchValues: {
          a: createMockFieldValues({
            field_id: PEOPLE.ID,
            values: [["a", "a@metabase.test"]],
          }),
        },
        remappedValues: {
          b: ["b", "b@metabase.test"],
        },
      });

      await userEvent.type(
        screen.getByPlaceholderText("Search by Name or enter an ID"),
        "a",
      );
      await userEvent.click(await screen.findByText("a@metabase.test"));
      await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith(["b", "a"]),
      );
    });

    it("should handle type/FK -> column field values remapping", async () => {
      const metadata = createMockMetadata({
        databases: [createSampleDatabase()],
        fields: [
          createOrdersProductIdField({
            base_type: "type/Text",
            effective_type: "type/Text",
            has_field_values: "search",
            dimensions: [
              createMockFieldDimension({
                type: "external",
                human_readable_field_id: PRODUCTS.TITLE,
              }),
            ],
          }),
        ],
      });
      const { query, stageIndex, findColumn } =
        createQueryWithMetadata(metadata);
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column: findColumn("ORDERS", "PRODUCT_ID"),
        values: ["b"],
        fieldId: ORDERS.PRODUCT_ID,
        searchFieldId: PRODUCTS.TITLE,
        searchValues: {
          a: createMockFieldValues({
            field_id: ORDERS.PRODUCT_ID,
            values: [["a", "a@metabase.test"]],
          }),
        },
        remappedValues: {
          b: ["b", "b@metabase.test"],
        },
      });

      await userEvent.type(
        screen.getByPlaceholderText("Search by Title or enter an ID"),
        "a",
      );
      await userEvent.click(await screen.findByText("a@metabase.test"));
      await waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(["b", "a"]);
      });
    });

    it("should handle custom field values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        searchValues: {
          a: createMockFieldValues({
            field_id: fieldId,
            values: [["a-test", "a@metabase.test"]],
          }),
        },
      });

      await userEvent.type(screen.getByPlaceholderText("Search by Email"), "a");
      await userEvent.click(await screen.findByText("a@metabase.test"));
      expect(onChange).toHaveBeenLastCalledWith(["a-test"]);
    });

    it("should allow free-form input without waiting for search results", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        searchValues: {
          "a@b.com": createMockFieldValues({
            field_id: fieldId,
            values: [["testa@b.com"]],
          }),
        },
      });

      await userEvent.type(
        screen.getByPlaceholderText("Search by Email"),
        "a@b.com",
      );
      expect(onChange).toHaveBeenLastCalledWith(["a@b.com"]);
    });

    it("should not be able to create duplicates with free-form input", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["a@b.com"],
        fieldId,
        searchValues: {
          "a@b.com": createMockFieldValues({
            field_id: fieldId,
            values: [["testa@b.com"]],
          }),
        },
      });

      const input = screen.getByRole("combobox", { name: "Filter value" });
      await userEvent.type(input, "a@b.com");
      input.blur();
      expect(onChange).toHaveBeenLastCalledWith(["a@b.com"]);
    });

    it("should not show free-form input in search results", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["a@b.com"],
        fieldId,
        searchValues: {
          "a@b": createMockFieldValues({
            field_id: fieldId,
            values: [["a@b.com"]],
          }),
        },
      });

      await userEvent.type(
        screen.getByRole("combobox", { name: "Filter value" }),
        "a@b",
      );
      expect(onChange).toHaveBeenLastCalledWith(["a@b.com", "a@b"]);
    });

    it("should trim clipboard data", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
      });

      const clipboardData = createMockClipboardData({
        getData: () => " abc\r\ndef",
      });
      await userEvent.click(
        screen.getByRole("combobox", { name: "Filter value" }),
      );
      await userEvent.paste(clipboardData);
      expect(onChange).toHaveBeenLastCalledWith(["abc", "def"]);
    });
  });

  describe("no values", () => {
    const column = findColumn("PEOPLE", "PASSWORD");

    it("should allow to add a value", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
      });

      await userEvent.type(
        screen.getByPlaceholderText("Enter some text"),
        "abc",
      );
      await userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith(["abc"]);
    });

    it("should allow to add multiple values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["abc"],
      });

      await userEvent.type(
        screen.getByRole("combobox", { name: "Filter value" }),
        "bce",
      );
      await userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith(["abc", "bce"]);
    });

    it("should not allow to add empty values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
      });

      const input = screen.getByPlaceholderText("Enter some text");
      await userEvent.type(input, "abc");
      await userEvent.clear(input);
      await userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("should not allow to add whitespace", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: [],
      });

      const input = screen.getByPlaceholderText("Enter some text");
      await userEvent.type(input, " ");
      await userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("should allow to remove a value when there are multiple values", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["abc", "bce"],
      });

      await userEvent.type(
        screen.getByRole("combobox", { name: "Filter value" }),
        "{backspace}",
      );

      expect(onChange).toHaveBeenLastCalledWith(["abc"]);
    });

    it("should allow to remove the last value", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["abc"],
      });

      await userEvent.type(
        screen.getByRole("combobox", { name: "Filter value" }),
        "{backspace}",
      );

      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("should allow to add multiple values that extend each other (metabase#21915)", async () => {
      const { onChange } = await setupStringPicker({
        query,
        stageIndex,
        column,
        values: ["a", "ab"],
      });

      await userEvent.type(
        screen.getByRole("combobox", { name: "Filter value" }),
        "abc",
      );
      await userEvent.tab();

      await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith(["a", "ab", "abc"]),
      );
    });
  });
});

describe("NumberFilterValuePicker", () => {
  const { query, stageIndex, findColumn } = createQueryWithMetadata();

  describe("list values", () => {
    const column = findColumn("ORDERS", "QUANTITY");
    const fieldId = ORDERS.QUANTITY;

    it("should allow to pick a list value", async () => {
      const { onChange } = await setupNumberPicker({
        query,
        stageIndex,
        column,
        values: [],
        fieldId,
        fieldValues: createMockFieldValues({
          field_id: fieldId,
          values: [[10], [20], [30]],
        }),
      });

      await userEvent.click(screen.getByText("20"));

      expect(onChange).toHaveBeenCalledWith([20]);
    });

    it("should handle type/PK -> type/Name field values remapping", async () => {
      const metadata = createMockMetadata({
        databases: [createSampleDatabase()],
        fields: [createPeopleIdField({ has_field_values: "list" })],
      });
      const { query, stageIndex, findColumn } =
        createQueryWithMetadata(metadata);
      const { onChange } = await setupNumberPicker({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "ID"),
        values: [1],
        fieldId: PEOPLE.ID,
        searchFieldId: PEOPLE.NAME,
        fieldValues: createMockFieldValues({
          field_id: PEOPLE.ID,
          values: [
            [1, "A"],
            [2, "B"],
            [3, "C"],
          ],
        }),
      });
      expect(screen.getByRole("checkbox", { name: "A" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "B" })).not.toBeChecked();

      await userEvent.type(screen.getByPlaceholderText("Search the list"), "B");
      expect(screen.getByText("B")).toBeInTheDocument();
      expect(screen.queryByText("C")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("B"));
      expect(onChange).toHaveBeenCalledWith([1, 2]);
    });

    it("should handle type/FK -> column field values remapping", async () => {
      const metadata = createMockMetadata({
        databases: [createSampleDatabase()],
        fields: [
          createOrdersProductIdField({
            dimensions: [
              createMockFieldDimension({
                human_readable_field_id: PRODUCTS.TITLE,
              }),
            ],
            has_field_values: "list",
          }),
        ],
      });
      const { query, stageIndex, findColumn } =
        createQueryWithMetadata(metadata);
      const { onChange } = await setupNumberPicker({
        query,
        stageIndex,
        column: findColumn("ORDERS", "PRODUCT_ID"),
        values: [1],
        fieldId: ORDERS.PRODUCT_ID,
        searchFieldId: PRODUCTS.TITLE,
        fieldValues: createMockFieldValues({
          field_id: ORDERS.PRODUCT_ID,
          values: [
            [1, "A"],
            [2, "B"],
            [3, "C"],
          ],
        }),
      });
      expect(screen.getByRole("checkbox", { name: "A" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "B" })).not.toBeChecked();

      await userEvent.type(screen.getByPlaceholderText("Search the list"), "B");
      expect(screen.getByText("B")).toBeInTheDocument();
      expect(screen.queryByText("C")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("B"));
      expect(onChange).toHaveBeenCalledWith([1, 2]);
    });

    it("should elevate selected field values on initial render", async () => {
      await setupNumberPicker({
        query,
        stageIndex,
        column,
        values: [20],
        fieldId,
        fieldValues: createMockFieldValues({
          field_id: fieldId,
          values: [
            [10, "To-do"],
            [20, "In-progress"],
            [30, "Completed"],
          ],
        }),
      });

      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes[0]).toHaveAccessibleName("Select all");
      expect(checkboxes[1]).toHaveAccessibleName("In-progress");
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).toHaveAccessibleName("To-do");
      expect(checkboxes[2]).not.toBeChecked();
      expect(checkboxes[3]).toHaveAccessibleName("Completed");
      expect(checkboxes[3]).not.toBeChecked();
    });
  });

  describe("search values", () => {
    it("should handle type/FK -> column field values remapping", async () => {
      const metadata = createMockMetadata({
        databases: [createSampleDatabase()],
        fields: [
          createOrdersProductIdField({
            has_field_values: "search",
            dimensions: [
              createMockFieldDimension({
                type: "external",
                human_readable_field_id: PRODUCTS.TITLE,
              }),
            ],
          }),
        ],
      });
      const { query, stageIndex, findColumn } =
        createQueryWithMetadata(metadata);
      const { onChange } = await setupNumberPicker({
        query,
        stageIndex,
        column: findColumn("ORDERS", "PRODUCT_ID"),
        values: [2],
        fieldId: ORDERS.PRODUCT_ID,
        searchFieldId: PRODUCTS.TITLE,
        searchValues: {
          a: createMockFieldValues({
            field_id: ORDERS.PRODUCT_ID,
            values: [[1, "a@metabase.test"]],
          }),
          c: createMockFieldValues({
            field_id: ORDERS.PRODUCT_ID,
            values: [],
          }),
        },
        remappedValues: {
          2: [2, "b@metabase.test"],
        },
      });

      await userEvent.type(
        screen.getByPlaceholderText("Search by Title or enter an ID"),
        "a",
      );
      await userEvent.click(await screen.findByText("a@metabase.test"));
      await waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith([2, 1]);
      });

      await userEvent.type(
        screen.getByPlaceholderText("Search by Title or enter an ID"),
        "c",
      );
      expect(
        await screen.findByText("No matching Title found."),
      ).toBeInTheDocument();
    });
  });

  describe("no values", () => {
    const column = findColumn("ORDERS", "TAX");

    it("should allow to add a value", async () => {
      const { onChange } = await setupNumberPicker({
        query,
        stageIndex,
        column,
        values: [],
      });

      const input = screen.getByPlaceholderText("Enter a number");
      await userEvent.type(input, "123");
      await userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith([123]);
    });

    it("should not allow to add empty values", async () => {
      const { onChange } = await setupNumberPicker({
        query,
        stageIndex,
        column,
        values: [],
      });

      const input = screen.getByPlaceholderText("Enter a number");
      await userEvent.type(input, "123");
      await userEvent.clear(input);
      await userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("should not allow to add invalid values", async () => {
      const { onChange } = await setupNumberPicker({
        query,
        stageIndex,
        column,
        values: [],
      });

      const input = screen.getByPlaceholderText("Enter a number");
      await userEvent.type(input, "abc");
      await userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("should not allow to add whitespace", async () => {
      const { onChange } = await setupNumberPicker({
        query,
        stageIndex,
        column,
        values: [],
      });

      const input = screen.getByPlaceholderText("Enter a number");
      await userEvent.type(input, " ");
      await userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith([]);
    });
  });
});

function createQueryWithMetadata(metadata = SAMPLE_METADATA) {
  const query = createQuery({ metadata });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  return { query, stageIndex, findColumn };
}
