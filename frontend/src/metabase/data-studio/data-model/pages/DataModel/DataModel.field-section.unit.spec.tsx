import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupLibraryEndpoints,
  setupTablesBulkEndpoints,
  setupUserAcknowledgementEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { UndoListing } from "metabase/common/components/UndoListing";
import { DataModelV1 } from "metabase/metadata/pages/DataModelV1";
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  Database,
  DatasetColumn,
  Field,
  FieldId,
  RowValue,
  Table,
  TableId,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDatabase,
  createMockField,
  createMockFieldDimension,
  createMockFieldValues,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersQuantityField,
  createOrdersTable,
  createOrdersTaxField,
  createOrdersUserIdField,
  createPeopleIdField,
  createPeopleTable,
  createProductsCategoryField,
  createProductsIdField,
  createProductsTable,
  createReviewsIdField,
  createReviewsTable,
} from "metabase-types/api/mocks/presets";

import { DataModel } from "./DataModel";

/**
 * Field section flows of the admin data model page and the data studio data
 * model page, rendered with the same token features as the e2e specs that
 * these tests replace (pro-self-hosted, so `advanced_permissions` adds
 * `include_editable_data_model` to the data model requests).
 *
 * The backend below keeps its state: a PUT /api/field/:id changes the field
 * that later GET requests return, so each flow goes through the real RTK
 * mutation, its optimistic patch and the refetch that follows it.
 */

registerVisualizations();

type Area = "admin" | "data studio";

const AREAS: Area[] = ["admin", "data studio"];

const TRIGGERED_FROM: Record<Area, string> = {
  admin: "admin",
  "data studio": "data_studio",
};

const DATA_MODEL_PARAMS = { include_editable_data_model: "true" };

const JSON_ROOT_ID = 9001;
const JSON_NESTED_ID = 9002;
const TEXT_ID = 9003;
const MANY_DATA_TYPES_ID = 9000;

function createInitialTables(): Table[] {
  return [
    createOrdersTable({
      fields: [
        createOrdersIdField({
          description:
            "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
        }),
        createOrdersUserIdField(),
        createOrdersProductIdField(),
        createOrdersTaxField(),
        createOrdersQuantityField({ has_field_values: "list" }),
      ],
    }),
    createPeopleTable({
      fields: [
        createPeopleIdField({
          description: "A unique identifier given to each user.",
        }),
      ],
    }),
    createProductsTable({
      fields: [
        createProductsIdField({
          description:
            "The numerical product number. Only used internally. All external communication should use the title.",
        }),
        createProductsCategoryField(),
      ],
    }),
    createReviewsTable({
      fields: [
        createReviewsIdField({
          description:
            "A unique internal identifier for the review. Should not be used externally.",
        }),
      ],
    }),
    createMockTable({
      id: MANY_DATA_TYPES_ID,
      db_id: SAMPLE_DB_ID,
      schema: "PUBLIC",
      name: "many_data_types",
      display_name: "Many Data Types",
      fields: [
        createMockField({
          id: JSON_ROOT_ID,
          table_id: MANY_DATA_TYPES_ID,
          name: "json",
          display_name: "Json",
          base_type: "type/JSON",
          effective_type: "type/JSON",
          position: 0,
        }),
        createMockField({
          id: JSON_NESTED_ID,
          table_id: MANY_DATA_TYPES_ID,
          name: "json → d",
          display_name: "Json → D",
          base_type: "type/Text",
          effective_type: "type/Text",
          nfc_path: ["json", "d"],
          position: 1,
        }),
        createMockField({
          id: TEXT_ID,
          table_id: MANY_DATA_TYPES_ID,
          name: "text",
          display_name: "Text",
          base_type: "type/Text",
          effective_type: "type/Text",
          position: 2,
        }),
      ],
    }),
  ];
}

/**
 * Values that the fake backend returns for a column of the preview query, in
 * ascending order of the table's primary key.
 */
const COLUMN_VALUES: Partial<Record<FieldId, RowValue[]>> = {
  // six values, so a preview that shows more or fewer than five rows is seen
  [ORDERS.TAX]: [2.07, 6.1, 2.9, 6.01, 7.03, 4.13],
  [ORDERS.QUANTITY]: [2, 3, 5],
  [ORDERS.PRODUCT_ID]: [14, 123, 105],
};

interface Backend {
  getField: (id: FieldId) => Field;
}

/**
 * A fake backend for the data model pages. It answers data model requests
 * only when they carry the parameters of the pro-self-hosted edition, and it
 * keeps the fields that PUT /api/field/:id writes.
 */
function setupBackend({
  fieldPatch = {},
}: { fieldPatch?: Record<FieldId, Partial<Field>> } = {}): Backend {
  const tables = createInitialTables();
  const fields = new Map<FieldId, Field>();
  tables.forEach((table) =>
    table.fields?.forEach((field) => {
      fields.set(Number(field.id), {
        ...field,
        ...fieldPatch[Number(field.id)],
      });
    }),
  );

  const getTableFields = (tableId: TableId) =>
    Array.from(fields.values()).filter((field) => field.table_id === tableId);
  const getTable = (tableId: TableId): Table => {
    const table = tables.find((table) => table.id === tableId);
    if (!table) {
      throw new Error(`Unknown table ${tableId}`);
    }
    return { ...table, fields: getTableFields(tableId) };
  };
  const getField = (id: FieldId) => {
    const field = fields.get(id);
    if (!field) {
      throw new Error(`Unknown field ${id}`);
    }
    return field;
  };

  const database: Database = createMockDatabase({
    id: SAMPLE_DB_ID,
    name: "Sample Database",
    features: ["nested-field-columns"],
    tables: tables.map((table) => ({ ...table, fields: undefined })),
  });

  fetchMock.get({
    url: "path:/api/database",
    query: DATA_MODEL_PARAMS,
    response: () => ({ data: [database], total: 1 }),
    name: "database-list",
  });
  fetchMock.get({
    url: `path:/api/database/${SAMPLE_DB_ID}`,
    query: DATA_MODEL_PARAMS,
    response: () => database,
    name: "database",
  });
  fetchMock.get({
    url: `path:/api/database/${SAMPLE_DB_ID}/schemas`,
    query: DATA_MODEL_PARAMS,
    response: ["PUBLIC"],
    name: "database-schemas",
  });
  fetchMock.get({
    url: `path:/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`,
    query: DATA_MODEL_PARAMS,
    response: () => tables.map((table) => getTable(table.id)),
    name: "database-schema",
  });
  fetchMock.get({
    url: `path:/api/database/${SAMPLE_DB_ID}/idfields`,
    query: DATA_MODEL_PARAMS,
    response: () =>
      Array.from(fields.values())
        .filter((field) => field.semantic_type === "type/PK")
        .map((field) => ({
          ...field,
          table: { ...getTable(Number(field.table_id)), fields: undefined },
        })),
    name: "database-idfields",
  });

  tables.forEach((table) => {
    fetchMock.get({
      url: `path:/api/table/${table.id}/query_metadata`,
      query: { include_sensitive_fields: "true", ...DATA_MODEL_PARAMS },
      response: () => getTable(table.id),
      name: `table-${table.id}-query-metadata`,
    });
    fetchMock.get({
      url: `path:/api/table/${table.id}/fks`,
      response: [],
      name: `table-${table.id}-fks`,
    });
  });

  fields.forEach((_field, id) => {
    fetchMock.get(`path:/api/field/${id}`, () => getField(id), {
      name: `field-${id}-get`,
    });
    fetchMock.put(
      `path:/api/field/${id}`,
      async (call) => {
        const body = JSON.parse(String(call.options.body));
        const field = { ...getField(id), ...body };
        fields.set(id, field);
        return field;
      },
      { name: `field-${id}-put` },
    );
    fetchMock.get(
      `path:/api/field/${id}/values`,
      () =>
        createMockFieldValues({
          field_id: id,
          // a field with a custom mapping has a display value for each value
          values: (COLUMN_VALUES[id] ?? []).map((value) =>
            hasCustomMapping(getField(id))
              ? [value, `${value} remapped`]
              : [value],
          ),
        }),
      { name: `field-${id}-values` },
    );
    fetchMock.post(
      `path:/api/field/${id}/values`,
      {},
      { name: `field-${id}-values-post` },
    );
    fetchMock.post(
      `path:/api/field/${id}/discard_values`,
      {},
      { name: `field-${id}-discard-values` },
    );
    fetchMock.post(
      `path:/api/field/${id}/rescan_values`,
      {},
      { name: `field-${id}-rescan-values` },
    );
  });

  fetchMock.post(
    "path:/api/dataset",
    async (call) => {
      const body = JSON.parse(String(call.options.body));
      const fieldIds = getQueriedFieldIds(body);
      const queriedFields = fieldIds.map(getField);
      const cols: DatasetColumn[] = queriedFields.map((field) =>
        createMockColumn({
          id: Number(field.id),
          table_id: Number(field.table_id),
          name: field.name,
          display_name: field.display_name,
          base_type: field.base_type,
          effective_type: field.effective_type,
          semantic_type: field.semantic_type,
          visibility_type: field.visibility_type,
          source: "fields",
          field_ref: ["field", Number(field.id), null],
        }),
      );
      const rowCount = Math.max(
        0,
        ...fieldIds.map((id) => COLUMN_VALUES[id]?.length ?? 0),
      );
      const rowsInPkOrder = Array.from({ length: rowCount }, (_, index) =>
        fieldIds.map((id) => COLUMN_VALUES[id]?.[index] ?? null),
      );
      const rows = getOrderBy(body).some(
        ({ direction }) => direction === "desc",
      )
        ? rowsInPkOrder.reverse()
        : rowsInPkOrder;
      return {
        status: "completed",
        row_count: rows.length,
        data: { cols, rows, rows_truncated: 0 },
      };
    },
    { name: "dataset" },
  );

  return { getField };
}

function hasCustomMapping(field: Field) {
  return field.dimensions?.some((dimension) => dimension.type === "internal");
}

/**
 * The preview queries name their columns in a `fields` clause (table
 * preview) or select the whole table (object detail preview).
 */
function getQueriedFieldIds(body: unknown): FieldId[] {
  const text = JSON.stringify(body);
  const sourceTable = text.match(/"source-table":(\d+)/);
  const fieldsClause = text.match(/"fields":\[(.*?)\]\]/);
  if (fieldsClause) {
    return Array.from(fieldsClause[1].matchAll(/\{[^}]*\},(\d+)/g)).map(
      (match) => Number(match[1]),
    );
  }
  if (sourceTable) {
    const table = createInitialTables().find(
      (table) => table.id === Number(sourceTable[1]),
    );
    return (table?.fields ?? [])
      .map((field) => Number(field.id))
      .filter((id) => COLUMN_VALUES[id] != null);
  }
  return [];
}

interface SetupOpts {
  area: Area;
  tableId: TableId;
  fieldId: FieldId;
  fieldPatch?: Record<FieldId, Partial<Field>>;
}

async function setup({ area, tableId, fieldId, fieldPatch }: SetupOpts) {
  const backend = setupBackend({ fieldPatch });
  setupTablesBulkEndpoints();
  setupUsersEndpoints([createMockUserListResult()]);
  setupUserAcknowledgementEndpoints({
    key: "seen-publish-tables-info",
    value: false,
  });
  setupLibraryEndpoints();
  const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        advanced_permissions: true,
        library: true,
      }),
    }),
  });
  setupEnterprisePlugins();

  const layout = (
    <>
      <Outlet />
      <UndoListing />
    </>
  );

  const routes =
    area === "admin" ? (
      <Route element={layout}>
        <Route path="admin/datamodel">
          <Route path="database/:databaseId" element={<DataModelV1 />} />
          <Route
            path="database/:databaseId/schema/:schemaId"
            element={<DataModelV1 />}
          />
          <Route
            path="database/:databaseId/schema/:schemaId/table/:tableId"
            element={<DataModelV1 />}
          />
          <Route
            path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
            element={<DataModelV1 />}
          />
        </Route>
      </Route>
    ) : (
      <Route element={layout}>
        <Route path="data-studio/data">
          <Route path="database/:databaseId" element={<DataModel />} />
          <Route
            path="database/:databaseId/schema/:schemaId"
            element={<DataModel />}
          />
          <Route
            path="database/:databaseId/schema/:schemaId/table/:tableId/:tab"
            element={<DataModel />}
          />
          <Route
            path="database/:databaseId/schema/:schemaId/table/:tableId/:tab/:fieldId"
            element={<DataModel />}
          />
        </Route>
      </Route>
    );

  const params = {
    databaseId: SAMPLE_DB_ID,
    schemaName: "PUBLIC",
    tableId,
    fieldId,
  };

  renderWithProviders(routes, {
    withRouter: true,
    initialRoute:
      area === "admin"
        ? Urls.dataModel(params)
        : Urls.dataStudioData({ ...params, tab: "field" }),
    storeInitialState: state,
  });

  expect(await findFieldSection()).toBeInTheDocument();
  await waitForLoaderToBeRemoved();

  return { backend, trackSimpleEvent };
}

describe.each(AREAS)("data model field section > %s", (area) => {
  const triggeredFrom = TRIGGERED_FROM[area];

  beforeEach(() => {
    // so the virtual lists render in the tests
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("name", () => {
    it("should allow changing the field name", async () => {
      await setup({ area, tableId: ORDERS_ID, fieldId: ORDERS.TAX });

      const input = getFieldNameInput();
      await userEvent.clear(input);
      await userEvent.type(input, "New tax");
      await userEvent.tab();

      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.TAX)).toEqual({
          display_name: "New tax",
        }),
      );
      await assertAndCloseToast("Name of Tax updated");
      expect(
        await findTableSectionFieldNameInput("New tax"),
      ).toBeInTheDocument();
      expect(getFieldPutCalls(ORDERS.TAX)).toHaveLength(1);
    });
  });

  describe("field values", () => {
    it("should not re-fetch field values after they are discarded when 'Custom mapping' is not used (metabase#62626)", async () => {
      await setup({
        area,
        tableId: PRODUCTS_ID,
        fieldId: PRODUCTS.CATEGORY,
      });

      await discardCachedFieldValues();

      expect(
        fetchMock.callHistory.calls(
          `field-${PRODUCTS.CATEGORY}-discard-values`,
        ),
      ).toHaveLength(1);
      expect(
        fetchMock.callHistory.calls(`field-${PRODUCTS.CATEGORY}-values`),
      ).toHaveLength(0);
    });

    it("should re-fetch field values after they are discarded when 'Custom mapping' is used (metabase#62626)", async () => {
      await setup({
        area,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
        fieldPatch: {
          [ORDERS.QUANTITY]: {
            dimensions: [
              createMockFieldDimension({ type: "internal", name: "Quantity" }),
            ],
          },
        },
      });
      expect(await findFieldDisplayValuesInput()).toHaveValue("Custom mapping");
      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls(`field-${ORDERS.QUANTITY}-values`),
        ).toHaveLength(1),
      );

      await discardCachedFieldValues();

      expect(
        fetchMock.callHistory.calls(`field-${ORDERS.QUANTITY}-discard-values`),
      ).toHaveLength(1);
      expect(
        fetchMock.callHistory.calls(`field-${ORDERS.QUANTITY}-values`),
      ).toHaveLength(2);
    });
  });

  describe("coercion strategy", () => {
    it("should allow to enable, change, and disable coercion strategy", async () => {
      const { trackSimpleEvent } = await setup({
        area,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });

      // show error when strategy not chosen after toggling
      await userEvent.click(getFieldCoercionToggle());
      await userEvent.click(document.body);
      expect(
        await within(getFieldSection()).findByText(
          "To enable casting, please select a data type",
        ),
      ).toBeInTheDocument();
      expect(getFieldPutCalls(ORDERS.QUANTITY)).toHaveLength(0);

      // enable casting
      await selectOption(
        getFieldCoercionInput(),
        "UNIX nanoseconds → Datetime",
      );
      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.QUANTITY)).toEqual({
          coercion_strategy: "Coercion/UNIXNanoSeconds->DateTime",
        }),
      );
      await assertAndCloseToast("Casting enabled for Quantity");
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "metadata_edited",
        event_detail: "type_casting",
        triggered_from: triggeredFrom,
      });

      // change casting
      await waitFor(() =>
        expect(getFieldCoercionInput()).toHaveValue(
          "UNIX nanoseconds → Datetime",
        ),
      );
      await selectOption(getFieldCoercionInput(), "UNIX seconds → Datetime");
      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.QUANTITY)).toEqual({
          coercion_strategy: "Coercion/UNIXSeconds->DateTime",
        }),
      );
      await assertAndCloseToast("Casting updated for Quantity");

      // disable casting
      await userEvent.click(getFieldCoercionToggle());
      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.QUANTITY)).toEqual({
          coercion_strategy: null,
        }),
      );
      await assertAndCloseToast("Casting disabled for Quantity");
      expect(
        within(getFieldSection()).queryByPlaceholderText("Select data type"),
      ).not.toBeInTheDocument();

      // enable casting again, the toggle opens the picker by itself
      await userEvent.click(getFieldCoercionToggle());
      const listbox = await screen.findByRole("listbox");
      await userEvent.click(
        within(listbox).getByText("UNIX seconds → Datetime"),
      );
      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.QUANTITY)).toEqual({
          coercion_strategy: "Coercion/UNIXSeconds->DateTime",
        }),
      );
      await assertAndCloseToast("Casting enabled for Quantity");
      expect(getFieldPutCalls(ORDERS.QUANTITY)).toHaveLength(4);
    });
  });

  describe("semantic type", () => {
    it("should allow to change the type to 'No semantic type' by typing to search (metabase#59052)", async () => {
      const { trackSimpleEvent } = await setup({
        area,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });

      const input = getFieldSemanticTypeInput();
      expect(input).toHaveValue("Foreign Key");
      await userEvent.type(input, "no sema{ArrowDown}{Enter}");

      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.PRODUCT_ID)).toEqual({
          semantic_type: null,
          fk_target_field_id: null,
        }),
      );
      await assertAndCloseToast("Semantic type of Product ID updated");
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "metadata_edited",
        event_detail: "semantic_type_change",
        triggered_from: triggeredFrom,
      });
      await waitFor(() =>
        expect(getFieldSemanticTypeInput()).toHaveValue("No semantic type"),
      );
      expect(
        within(getFieldSection()).queryByLabelText("Foreign key target"),
      ).not.toBeInTheDocument();
    });

    it("should filter the options of the foreign key target picker by name and description (metabase#56839)", async () => {
      await setup({ area, tableId: ORDERS_ID, fieldId: ORDERS.PRODUCT_ID });

      const input = getFieldSemanticTypeFkTargetInput();
      await waitFor(() => expect(input).toHaveValue("Products → ID"));
      await userEvent.clear(input);
      const listbox = await screen.findByRole("listbox");
      expect(listbox).toHaveTextContent("Orders → ID");
      expect(listbox).toHaveTextContent("People → ID");
      expect(listbox).toHaveTextContent("Products → ID");
      expect(listbox).toHaveTextContent("Reviews → ID");

      // case-insensitive match of the field display name
      await userEvent.type(input, "id");
      expect(listbox).toHaveTextContent("Orders → ID");
      expect(listbox).toHaveTextContent("People → ID");
      expect(listbox).toHaveTextContent("Products → ID");
      expect(listbox).toHaveTextContent("Reviews → ID");

      // case-insensitive match of the field description
      await userEvent.clear(input);
      await userEvent.type(input, "EXT");
      expect(listbox).not.toHaveTextContent("Orders → ID");
      expect(listbox).not.toHaveTextContent("People → ID");
      expect(listbox).toHaveTextContent("Products → ID");
      expect(listbox).toHaveTextContent("Reviews → ID");
      expect(getFieldPutCalls(ORDERS.PRODUCT_ID)).toHaveLength(0);
    });

    it("should show an error with links to other fields with the 'Entity Name' semantic type", async () => {
      await setup({
        area,
        tableId: MANY_DATA_TYPES_ID,
        fieldId: JSON_NESTED_ID,
      });

      await selectOption(getFieldSemanticTypeInput(), "Entity Name");
      await waitFor(() =>
        expect(getFieldPutBody(JSON_NESTED_ID)).toMatchObject({
          semantic_type: "type/Name",
        }),
      );
      expect(
        within(getFieldSection()).queryByText(
          /There are other fields with this semantic type/,
        ),
      ).not.toBeInTheDocument();

      await clickTableSectionField("Text");
      await waitFor(() => expect(getFieldNameInput()).toHaveValue("Text"));
      await selectOption(getFieldSemanticTypeInput(), "Entity Name");
      await waitFor(() =>
        expect(getFieldPutBody(TEXT_ID)).toMatchObject({
          semantic_type: "type/Name",
        }),
      );

      expect(
        await within(getFieldSection()).findByText(
          /There are other fields with this semantic type/,
        ),
      ).toHaveTextContent(
        "There are other fields with this semantic type: Json: Json → D",
      );
      await userEvent.click(
        within(getFieldSection()).getByRole("link", {
          name: "Json: Json → D",
        }),
      );
      await waitFor(() => expect(getFieldNameInput()).toHaveValue("Json → D"));

      expect(
        await within(getFieldSection()).findByText(
          /There are other fields with this semantic type/,
        ),
      ).toHaveTextContent(
        "There are other fields with this semantic type: Text",
      );
      await userEvent.click(
        within(getFieldSection()).getByRole("link", { name: "Text" }),
      );
      await waitFor(() => expect(getFieldNameInput()).toHaveValue("Text"));
    });
  });

  describe("visibility", () => {
    it("should let you change field visibility to 'Everywhere'", async () => {
      const { trackSimpleEvent } = await setup({
        area,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
        fieldPatch: { [ORDERS.TAX]: { visibility_type: "sensitive" } },
      });

      expect(getFieldVisibilityInput()).toHaveValue("Do not include");
      await selectOption(getFieldVisibilityInput(), "Everywhere");
      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.TAX)).toEqual({
          visibility_type: "normal",
        }),
      );
      await assertAndCloseToast("Visibility of Tax updated");
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "metadata_edited",
        event_detail: "visibility_change",
        triggered_from: triggeredFrom,
      });
      await waitFor(() =>
        expect(getFieldVisibilityInput()).toHaveValue("Everywhere"),
      );

      await openPreview();
      const preview = within(getPreviewSection());
      expect(await preview.findByText("6.1")).toBeInTheDocument();
      expect(
        preview.getAllByTestId("cell-data").map((cell) => cell.textContent),
      ).toEqual(["Tax", "2.07", "6.1", "2.9", "6.01", "7.03"]);
      expect(
        preview.queryByText("This field is hidden"),
      ).not.toBeInTheDocument();
      expect(getDatasetSourceTableIds()).toEqual([ORDERS_ID]);
      expect(getDatasetFieldIds()).toEqual([[ORDERS.TAX]]);
      expect(getDatasetBodies().map(getOrderBy)).toEqual([
        [{ direction: "asc", fieldId: ORDERS.ID }],
      ]);
      expect(getDatasetLimits()).toEqual([50]);

      await userEvent.click(preview.getByLabelText("Detail"));
      expect(await preview.findByText("2.07")).toBeInTheDocument();
      expect(preview.getByText("Tax")).toBeInTheDocument();
    });

    it("should let you change field visibility to 'Do not include' while the filtering preview is open (metabase#61806)", async () => {
      await setup({ area, tableId: ORDERS_ID, fieldId: ORDERS.TAX });

      await openPreview();
      const preview = within(getPreviewSection());
      await userEvent.click(preview.getByLabelText("Filtering"));
      expect(
        await preview.findByTestId("number-filter-picker"),
      ).toBeInTheDocument();

      expect(getFieldVisibilityInput()).toHaveValue("Everywhere");
      await selectOption(getFieldVisibilityInput(), "Do not include");
      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.TAX)).toEqual({
          visibility_type: "sensitive",
        }),
      );

      expect(
        await preview.findByText("This field is hidden"),
      ).toBeInTheDocument();
      expect(
        preview.queryByTestId("number-filter-picker"),
      ).not.toBeInTheDocument();
    });

    it("should let you change field visibility to 'Only in detail views'", async () => {
      await setup({ area, tableId: ORDERS_ID, fieldId: ORDERS.TAX });

      expect(getFieldVisibilityInput()).toHaveValue("Everywhere");
      await selectOption(getFieldVisibilityInput(), "Only in detail views");
      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.TAX)).toEqual({
          visibility_type: "details-only",
        }),
      );
      await assertAndCloseToast("Visibility of Tax updated");
      await waitFor(() =>
        expect(getFieldVisibilityInput()).toHaveValue("Only in detail views"),
      );

      await openPreview();
      const preview = within(getPreviewSection());
      expect(
        await preview.findByText("This field is hidden"),
      ).toBeInTheDocument();
      expect(fetchMock.callHistory.calls("dataset")).toHaveLength(0);

      await userEvent.click(preview.getByLabelText("Detail"));
      expect(await preview.findByText("2.07")).toBeInTheDocument();
      expect(preview.getByText("Tax")).toBeInTheDocument();
      expect(getDatasetSourceTableIds()).toEqual([ORDERS_ID]);
    });
  });

  describe("filtering", () => {
    it("should let you change filtering to 'Plain input box'", async () => {
      const { trackSimpleEvent } = await setup({
        area,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });

      expect(getFieldFilteringInput()).toHaveValue("A list of all values");
      await selectOption(getFieldFilteringInput(), "Plain input box");
      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.QUANTITY)).toEqual({
          has_field_values: "none",
        }),
      );
      await assertAndCloseToast("Filtering of Quantity updated");
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "metadata_edited",
        event_detail: "filtering_change",
        triggered_from: triggeredFrom,
      });
      await waitFor(() =>
        expect(getFieldFilteringInput()).toHaveValue("Plain input box"),
      );

      await openPreview();
      const preview = within(getPreviewSection());
      await userEvent.click(preview.getByLabelText("Filtering"));
      expect(await preview.findByPlaceholderText("Min")).toBeInTheDocument();
      expect(preview.getByPlaceholderText("Max")).toBeInTheDocument();
      expect(
        preview.queryByPlaceholderText("Search the list"),
      ).not.toBeInTheDocument();
      expect(
        preview.queryByRole("button", { name: /Add filter/ }),
      ).not.toBeInTheDocument();
    });

    it("should let you change filtering to 'A list of all values'", async () => {
      await setup({
        area,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
        fieldPatch: { [ORDERS.QUANTITY]: { has_field_values: "none" } },
      });

      expect(getFieldFilteringInput()).toHaveValue("Plain input box");
      await selectOption(getFieldFilteringInput(), "A list of all values");
      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.QUANTITY)).toEqual({
          has_field_values: "list",
        }),
      );
      await assertAndCloseToast("Filtering of Quantity updated");
      await waitFor(() =>
        expect(getFieldFilteringInput()).toHaveValue("A list of all values"),
      );

      await openPreview();
      const preview = within(getPreviewSection());
      await userEvent.click(preview.getByLabelText("Filtering"));
      expect(
        await preview.findByPlaceholderText("Search the list"),
      ).toBeInTheDocument();
      expect(preview.queryByPlaceholderText("Min")).not.toBeInTheDocument();
      expect(
        preview.queryByRole("button", { name: /Add filter/ }),
      ).not.toBeInTheDocument();
    });
  });
});

function getFieldPutCalls(fieldId: FieldId) {
  return fetchMock.callHistory.calls(`field-${fieldId}-put`);
}

function getFieldPutBody(fieldId: FieldId): unknown {
  const call = fetchMock.callHistory.lastCall(`field-${fieldId}-put`);
  return call ? JSON.parse(String(call.options.body)) : undefined;
}

function getDatasetBodies(): unknown[] {
  return fetchMock.callHistory
    .calls("dataset")
    .map((call) => JSON.parse(String(call.options.body)));
}

function getDatasetFieldIds() {
  return getDatasetBodies().map(getQueriedFieldIds);
}

function getOrderBy(body: unknown) {
  const orderBy = JSON.stringify(body).match(/"order-by":\[(.*?)\]\]\]/);
  if (!orderBy) {
    return [];
  }
  return Array.from(
    orderBy[1].matchAll(/"(asc|desc)",\{[^}]*\},\["field",\{[^}]*\},(\d+)/g),
  ).map((match) => ({ direction: match[1], fieldId: Number(match[2]) }));
}

function getDatasetLimits() {
  return getDatasetBodies().map((body) => {
    const match = JSON.stringify(body).match(/"limit":(\d+)/);
    return match ? Number(match[1]) : undefined;
  });
}

function getDatasetSourceTableIds() {
  return getDatasetBodies().map((body) => {
    const match = JSON.stringify(body).match(/"source-table":(\d+)/);
    return match ? Number(match[1]) : undefined;
  });
}

async function selectOption(input: HTMLElement, name: string) {
  await userEvent.click(input);
  const listbox = await screen.findByRole("listbox");
  await userEvent.click(within(listbox).getByText(name));
}

async function assertAndCloseToast(message: string) {
  const undoList = within(await screen.findByTestId("undo-list"));
  expect(await undoList.findByText(message)).toBeInTheDocument();
  const [toast] = undoList
    .getAllByTestId("toast-undo")
    .filter((toast) => within(toast).queryByText(message) != null);
  await userEvent.click(within(toast).getByLabelText("close icon"));
  await waitFor(() =>
    expect(undoList.queryByText(message)).not.toBeInTheDocument(),
  );
  // the refetch that follows a write must land before the next step, as it
  // does for a user who reads the toast
  await act(() => fetchMock.callHistory.flush(true));
}

async function discardCachedFieldValues() {
  await userEvent.click(
    within(getFieldSection()).getByRole("button", { name: /Field values/ }),
  );
  const modal = within(await screen.findByRole("dialog"));
  await userEvent.click(
    modal.getByRole("button", { name: "Discard cached field values" }),
  );
  expect(
    await modal.findByRole("button", { name: "Discard triggered!" }),
  ).toBeInTheDocument();
  expect(
    await modal.findByRole(
      "button",
      { name: "Discard cached field values" },
      { timeout: 3000 },
    ),
  ).toBeInTheDocument();
}

async function openPreview() {
  await userEvent.click(
    within(getFieldSection()).getByRole("button", { name: /Preview/ }),
  );
}

function getPreviewSection() {
  return screen.getByTestId("preview-section");
}

async function findFieldSection() {
  return screen.findByTestId("field-section");
}

function getFieldSection() {
  return screen.getByTestId("field-section");
}

function getFieldNameInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Give this field a name",
  );
}

function getFieldCoercionToggle() {
  return within(getFieldSection()).getByLabelText(
    "Cast to a specific data type",
  );
}

function getFieldCoercionInput() {
  return within(getFieldSection()).getByPlaceholderText("Select data type");
}

function getFieldSemanticTypeInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select a semantic type",
  );
}

function getFieldSemanticTypeFkTargetInput() {
  return within(getFieldSection()).getByLabelText("Foreign key target");
}

function getFieldVisibilityInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select a field visibility",
  );
}

function getFieldFilteringInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select field filtering",
  );
}

function findFieldDisplayValuesInput() {
  return within(getFieldSection()).findByPlaceholderText(
    "Select display values",
  );
}

function getTableSection() {
  return screen.getByTestId("table-section");
}

async function findTableSectionFieldNameInput(name: string) {
  return within(getTableSection()).findByDisplayValue(name);
}

async function clickTableSectionField(name: string) {
  const field = within(getTableSection()).getByRole("listitem", { name });
  await userEvent.click(within(field).getByRole("img"));
}
