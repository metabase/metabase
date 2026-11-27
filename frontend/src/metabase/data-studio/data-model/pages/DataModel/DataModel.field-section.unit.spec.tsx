import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import _ from "underscore";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupLibraryEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupTablesBulkEndpoints,
  setupUserAcknowledgementEndpoints,
  setupUserMetabotPermissionsEndpoint,
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
import { getDataStudioMetadataRoutes } from "metabase/data-studio/data-model/routes";
import { DataModelV1 } from "metabase/metadata/pages/DataModelV1";
import { Palette } from "metabase/palette/components/Palette";
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { DataStudioTableMetadataTab } from "metabase/urls/data-studio";
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
  createMockCollection,
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
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersQuantityField,
  createOrdersSubtotalField,
  createOrdersTable,
  createOrdersTaxField,
  createOrdersTotalField,
  createOrdersUserIdField,
  createPeopleIdField,
  createPeopleTable,
  createProductsCategoryField,
  createProductsIdField,
  createProductsTable,
  createProductsTitleField,
  createReviewsIdField,
  createReviewsTable,
} from "metabase-types/api/mocks/presets";

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

const TOTAL_DESCRIPTION = "The total billed amount.";

/** a table published into a collection that remote sync keeps read-only */
const READ_ONLY_PUBLISHED_TABLE: Partial<Table> = {
  can_write: false,
  collection: createMockCollection({ name: "Synced library data" }),
};

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
        createOrdersSubtotalField(),
        createOrdersTaxField(),
        createOrdersTotalField({ description: TOTAL_DESCRIPTION }),
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
        createProductsTitleField(),
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
  [ORDERS.TOTAL]: [39.72, 117.03, 49.21, 115.23, 134.91],
  [PRODUCTS.CATEGORY]: ["Doohickey", "Gadget", "Widget"],
};

interface Backend {
  getField: (id: FieldId) => Field;
}

interface BackendOpts {
  fieldPatch?: Record<FieldId, Partial<Field>>;
  tablePatch?: Record<TableId, Partial<Table>>;
  /** the preview queries return no rows */
  isEmpty?: boolean;
}

/**
 * The field positions that the backend computes for a field order. "smart"
 * stands in for the backend heuristic (warehouse_schema_rest table_test
 * `field-ordering-test`): the primary key, the other fields, then the foreign
 * keys, each group in database order.
 *
 * `fieldsInDatabaseOrder` are the fields in the order the table defines them.
 */
function getFieldsInOrder(
  fieldsInDatabaseOrder: Field[],
  fieldOrder: Table["field_order"],
) {
  const fields = fieldsInDatabaseOrder;
  switch (fieldOrder) {
    case "alphabetical":
      return _.sortBy(fields, (field) => field.name);
    case "smart":
      return _.sortBy(fields, (field) => {
        if (field.semantic_type === "type/PK") {
          return 0;
        }
        return field.semantic_type === "type/FK" ? 2 : 1;
      });
    case "custom":
      return _.sortBy(fields, (field) => field.position);
    default:
      return fields;
  }
}

/**
 * A fake backend for the data model pages. It answers data model requests
 * only when they carry the parameters of the pro-self-hosted edition, and it
 * keeps the fields that PUT /api/field/:id writes and the tables that
 * PUT /api/table/:id writes.
 */
function setupBackend({
  fieldPatch = {},
  tablePatch = {},
  isEmpty = false,
}: BackendOpts = {}): Backend {
  const tables = createInitialTables().map((table) => ({
    ...table,
    ...tablePatch[table.id],
  }));
  const fields = new Map<FieldId, Field>();
  tables.forEach((table) =>
    table.fields?.forEach((field, index) => {
      fields.set(Number(field.id), {
        ...field,
        position: index,
        ...fieldPatch[Number(field.id)],
      });
    }),
  );

  // in database order: Map#set keeps the place of a key that is updated
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
  const updateTable = (tableId: TableId, body: Partial<Table>) => {
    const index = tables.findIndex((table) => table.id === tableId);
    const table = { ...tables[index], ...body };
    tables[index] = table;
    if (body.field_order != null) {
      getFieldsInOrder(getTableFields(tableId), body.field_order).forEach(
        (field, position) =>
          fields.set(Number(field.id), { ...field, position }),
      );
    }
    return getTable(tableId);
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
    fetchMock.put(
      `path:/api/table/${table.id}`,
      (call) => updateTable(table.id, JSON.parse(String(call.options.body))),
      { name: `table-${table.id}-put` },
    );
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
          description: field.description,
          source: "fields",
          field_ref: ["field", Number(field.id), null],
        }),
      );
      const rowCount = isEmpty
        ? 0
        : Math.max(0, ...fieldIds.map((id) => COLUMN_VALUES[id]?.length ?? 0));
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

function setupRootCollectionEndpoint() {
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", can_write: true })],
  });
}

function setupCommandPaletteEndpoints() {
  setupSearchEndpoints([]);
  setupRecentViewsEndpoints([]);
  setupUserMetabotPermissionsEndpoint();
  setupRootCollectionEndpoint();
  // the palette lists databases without the data model parameters
  fetchMock.get(
    "path:/api/database",
    { data: [], total: 0 },
    { name: "palette-database-list" },
  );
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

interface SetupOpts extends BackendOpts {
  area: Area;
  tableId: TableId;
  /** without a field, the data studio opens the table on `tab` */
  fieldId?: FieldId;
  tab?: DataStudioTableMetadataTab;
  isRemoteSyncReadOnly?: boolean;
  withCommandPalette?: boolean;
}

async function setup({
  area,
  tableId,
  fieldId,
  tab = "field",
  isRemoteSyncReadOnly = false,
  withCommandPalette = false,
  ...backendOpts
}: SetupOpts) {
  const backend = setupBackend(backendOpts);
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
        remote_sync: isRemoteSyncReadOnly,
      }),
      ...(isRemoteSyncReadOnly && {
        "remote-sync-enabled": true,
        "remote-sync-type": "read-only",
      }),
    }),
  });
  setupEnterprisePlugins();
  if (withCommandPalette) {
    setupCommandPaletteEndpoints();
  }
  if (isRemoteSyncReadOnly) {
    setupRootCollectionEndpoint();
  }

  const layout = (
    <>
      <Outlet />
      <UndoListing />
      {withCommandPalette && <Palette />}
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
          {getDataStudioMetadataRoutes(Outlet)}
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
        : Urls.dataStudioData({ ...params, tab }),
    storeInitialState: state,
    withKBar: withCommandPalette,
  });

  if (fieldId != null) {
    expect(await findFieldSection()).toBeInTheDocument();
  } else {
    expect(await screen.findByTestId("table-section")).toBeInTheDocument();
  }
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

  describe("read-only remote sync", () => {
    it("should show a published table that cannot be written", async () => {
      await setup({
        area,
        tableId: ORDERS_ID,
        tab: "details",
        isRemoteSyncReadOnly: true,
        tablePatch: {
          [ORDERS_ID]: READ_ONLY_PUBLISHED_TABLE,
          [PRODUCTS_ID]: READ_ONLY_PUBLISHED_TABLE,
        },
        fieldPatch: {
          [ORDERS.PRODUCT_ID]: {
            dimensions: [
              createMockFieldDimension({
                type: "external",
                name: "Product ID",
                human_readable_field_id: PRODUCTS.TITLE,
              }),
            ],
          },
        },
      });
      // the display values picker loads the database without the data model
      // parameters, so this route only answers what the routes above do not
      fetchMock.get(
        `path:/api/database/${SAMPLE_DB_ID}`,
        createMockDatabase({ id: SAMPLE_DB_ID, name: "Sample Database" }),
        { name: "database-without-data-model-params" },
      );

      // table picker and table
      expect(await findTablePickerItem("Orders")).toBeInTheDocument();
      expect(await findTablePickerItem("Products")).toBeInTheDocument();
      const tableNameInput = await findTableNameInput("Orders");
      expect(tableNameInput).toHaveAttribute("readonly");
      if (area === "data studio") {
        await clickFieldsTab();
      }

      // field metadata, FK target and remapping
      await clickTableSectionField("Product ID");
      await waitFor(() =>
        expect(getFieldNameInput()).toHaveValue("Product ID"),
      );
      await waitFor(() =>
        expect(getFieldSemanticTypeFkTargetInput()).toHaveValue(
          "Products → ID",
        ),
      );
      expect(await findFieldDisplayValuesInput()).toHaveValue(
        "Use foreign key",
      );
      await waitFor(() =>
        expect(
          within(getFieldSection()).getByPlaceholderText("Choose a field"),
        ).toHaveValue("Title"),
      );

      // preview
      await openPreview();
      const preview = within(getPreviewSection());
      expect(await preview.findByText("Product ID")).toBeInTheDocument();
      expect(await preview.findByText("123")).toBeInTheDocument();
      await userEvent.click(preview.getByLabelText("Detail"));
      expect(await preview.findByText("Product ID")).toBeInTheDocument();
      expect(await preview.findByText("14")).toBeInTheDocument();
      expect(
        preview.queryByText("Sorry, you don’t have permission to see that."),
      ).not.toBeInTheDocument();

      // field values, with the preview that stays open
      await userEvent.click(await findTablePickerItem("Products"));
      expect(await findTableNameInput("Products")).toBeInTheDocument();
      if (area === "data studio") {
        await clickFieldsTab();
      }
      await waitFor(() => clickTableSectionField("Category"));
      await waitFor(() => expect(getFieldNameInput()).toHaveValue("Category"));
      await userEvent.click(
        within(getPreviewSection()).getByLabelText("Filtering"),
      );
      expect(
        await within(getPreviewSection()).findByText("Doohickey"),
      ).toBeInTheDocument();
    });
  });
});

describe("data studio data model page", () => {
  const area: Area = "data studio";

  beforeEach(() => {
    // so the virtual lists render in the tests
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("preview section", () => {
    it("should close the preview with Esc key only when no overlay is open", async () => {
      await setup({
        area,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
        withCommandPalette: true,
      });

      // close the preview with Esc key
      expect(screen.queryByTestId("preview-section")).not.toBeInTheDocument();
      await openPreview();
      expect(getPreviewSection()).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByTestId("preview-section")).not.toBeInTheDocument();

      // do not close the preview with Esc key while modal is open
      await openPreview();
      expect(getPreviewSection()).toBeInTheDocument();
      await userEvent.click(
        within(getFieldSection()).getByRole("button", { name: /Field values/ }),
      );
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(getPreviewSection()).toBeInTheDocument();

      // do not close the preview with Esc key while command palette is open
      await userEvent.keyboard("[ControlLeft>]k[/ControlLeft]");
      expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument(),
      );
      expect(getPreviewSection()).toBeInTheDocument();

      // do not close the preview with Esc key while popover is open
      await userEvent.click(getFieldSemanticTypeInput());
      expect(await screen.findByRole("listbox")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
      );
      expect(getPreviewSection()).toBeInTheDocument();
    });

    it("should not auto-focus inputs in filtering preview", async () => {
      await setup({ area, tableId: ORDERS_ID, fieldId: ORDERS.PRODUCT_ID });

      await openPreview();
      await userEvent.click(
        within(getPreviewSection()).getByLabelText("Filtering"),
      );
      const idInput =
        await within(getPreviewSection()).findByPlaceholderText("Enter an ID");
      expect(idInput).toBeVisible();
      expect(idInput).not.toHaveFocus();

      await selectOption(getFieldFilteringInput(), "A list of all values");
      const listSearchInput =
        await within(getPreviewSection()).findByPlaceholderText(
          "Search the list",
        );
      expect(listSearchInput).toBeVisible();
      expect(listSearchInput).not.toHaveFocus();

      await clickTableSectionField("Tax");
      const minInput =
        await within(getPreviewSection()).findByPlaceholderText("Min");
      expect(minInput).toBeVisible();
      expect(minInput).not.toHaveFocus();

      await selectOption(getFieldFilteringInput(), "Search box");
      const numberInput =
        await within(getPreviewSection()).findByPlaceholderText(
          "Enter a number",
        );
      expect(numberInput).toBeVisible();
      expect(numberInput).not.toHaveFocus();
    });

    it("should show empty state when there is no data", async () => {
      await setup({
        area,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
        isEmpty: true,
      });

      await openPreview();
      const preview = within(getPreviewSection());
      expect(await preview.findByText("No data to show")).toBeInTheDocument();
      expect(getDatasetSourceTableIds()).toEqual([ORDERS_ID]);

      await userEvent.click(preview.getByLabelText("Detail"));
      await waitFor(() => expect(getDatasetSourceTableIds()).toHaveLength(2));
      expect(await preview.findByText("No data to show")).toBeInTheDocument();
    });

    it("should not crash when viewing filtering preview of a hidden table", async () => {
      await setup({
        area,
        tableId: ORDERS_ID,
        tab: "details",
        tablePatch: { [ORDERS_ID]: { data_layer: "internal" } },
      });

      await selectOption(
        within(getTableSection()).getByRole("textbox", {
          name: "Visibility layer",
        }),
        "Hidden",
      );
      await waitFor(() =>
        expect(getTablePutBodies(ORDERS_ID)).toEqual([
          { data_layer: "hidden" },
        ]),
      );

      await clickFieldsTab();
      await clickTableSectionField("Product ID");
      await waitFor(() =>
        expect(getFieldNameInput()).toHaveValue("Product ID"),
      );
      await openPreview();
      await userEvent.click(
        within(getPreviewSection()).getByLabelText("Filtering"),
      );
      expect(
        await within(getPreviewSection()).findByPlaceholderText("Enter an ID"),
      ).toBeVisible();
      expect(
        screen.queryByText("Something’s gone wrong"),
      ).not.toBeInTheDocument();
    });
  });

  describe("table and field details", () => {
    it("should allow you to close table and field details", async () => {
      await setup({ area, tableId: ORDERS_ID, fieldId: ORDERS.PRODUCT_ID });

      await openPreview();
      expect(getPreviewSection()).toBeInTheDocument();

      await userEvent.click(
        within(screen.getByTestId("field-section-header")).getByRole("link", {
          name: /close/,
        }),
      );
      await waitFor(() =>
        expect(screen.queryByTestId("field-section")).not.toBeInTheDocument(),
      );
      expect(screen.queryByTestId("preview-section")).not.toBeInTheDocument();
      expect(getTableSection()).toBeInTheDocument();

      await userEvent.click(
        within(screen.getByTestId("table-section-header")).getByRole("link", {
          name: /close/,
        }),
      );
      await waitFor(() =>
        expect(screen.queryByTestId("table-section")).not.toBeInTheDocument(),
      );

      // the preview opened state was cleared and does not re-appear
      await userEvent.click(await findTablePickerItem("Orders"));
      expect(await findTableNameInput("Orders")).toBeInTheDocument();
      await clickFieldsTab();
      await clickTableSectionField("Subtotal");
      await waitFor(() => expect(getFieldNameInput()).toHaveValue("Subtotal"));
      expect(screen.queryByTestId("preview-section")).not.toBeInTheDocument();
      expect(getFieldSection()).toBeInTheDocument();
      expect(getTableSection()).toBeInTheDocument();
    });

    it("should allow clearing a field description", async () => {
      await setup({ area, tableId: ORDERS_ID });

      const descriptionInput = getTableSectionFieldDescriptionInput("Total");
      expect(descriptionInput).toHaveValue(TOTAL_DESCRIPTION);
      await userEvent.clear(descriptionInput);
      await userEvent.tab();

      await waitFor(() =>
        expect(getFieldPutBody(ORDERS.TOTAL)).toEqual({ description: null }),
      );
      await assertAndCloseToast("Description of Total updated");
      expect(getTableSectionFieldDescriptionInput("Total")).toHaveValue("");
      expect(getFieldPutCalls(ORDERS.TOTAL)).toHaveLength(1);

      // the cleared description is what the backend returns afterwards
      await userEvent.click(await findTablePickerItem("Products"));
      expect(await findTableNameInput("Products")).toBeInTheDocument();
      await userEvent.click(await findTablePickerItem("Orders"));
      expect(await findTableNameInput("Orders")).toBeInTheDocument();
      await clickFieldsTab();
      await waitFor(() =>
        expect(getTableSectionFieldDescriptionInput("Total")).toHaveValue(""),
      );

      // verify preview
      await clickTableSectionField("Total");
      await waitFor(() => expect(getFieldNameInput()).toHaveValue("Total"));
      await openPreview();
      const preview = within(getPreviewSection());
      expect(await preview.findByText("117.03")).toBeInTheDocument();
      expect(
        preview.getAllByTestId("cell-data").map((cell) => cell.textContent),
      ).toEqual(["Total", "39.72", "117.03", "49.21", "115.23", "134.91"]);
      await userEvent.hover(
        within(preview.getByTestId("header-cell")).getByText("Total"),
      );
      // the column info hovercard opens after a delay
      const hovercard = await screen.findByRole(
        "dialog",
        {},
        { timeout: 3000 },
      );
      expect(hovercard).toHaveTextContent("No description");
      expect(hovercard).not.toHaveTextContent(TOTAL_DESCRIPTION);
    });
  });

  describe("table actions menu", () => {
    it.each([
      {
        item: "Re-sync schema",
        route: "tables-sync-schema",
        toast: "Sync triggered",
      },
      {
        item: "Re-scan field values",
        route: "tables-rescan-values",
        toast: "Scan triggered",
      },
      {
        item: "Discard cached field values",
        route: "tables-discard-values",
        toast: "Discard triggered",
      },
    ])(
      "should trigger '$item' for the table",
      async ({ item, route, toast }) => {
        // not the first table, and an id that no database shares
        await setup({ area, tableId: PEOPLE_ID, tab: "details" });

        await userEvent.click(
          within(getTableSection()).getByRole("button", {
            name: "More actions",
          }),
        );
        await userEvent.click(
          await screen.findByRole("menuitem", { name: new RegExp(item) }),
        );

        await waitFor(() =>
          expect(fetchMock.callHistory.calls(route)).toHaveLength(1),
        );
        expect(
          JSON.parse(
            String(fetchMock.callHistory.lastCall(route)?.options.body),
          ),
        ).toEqual({ table_ids: [PEOPLE_ID] });
        await assertAndCloseToast(toast);
      },
    );
  });

  describe("sorting", () => {
    it("should allow sorting fields as in the database, alphabetically, and smartly", async () => {
      await setup({ area, tableId: ORDERS_ID });

      await userEvent.click(
        within(getTableSection()).getByRole("button", { name: /Sorting/ }),
      );
      expect(getSortOrderRadio("database")).toBeChecked();
      expect(getSortableFieldNames()).toEqual([
        "ID",
        "User ID",
        "Product ID",
        "Subtotal",
        "Tax",
        "Total",
        "Quantity",
      ]);

      await userEvent.click(
        within(getSortOrderInput()).getByLabelText("Alphabetical order"),
      );
      await waitFor(() =>
        expect(getTablePutBodies(ORDERS_ID)).toEqual([
          { field_order: "alphabetical" },
        ]),
      );
      await assertAndCloseToast("Field order updated");
      expect(getSortOrderRadio("alphabetical")).toBeChecked();
      await waitFor(() =>
        expect(getSortableFieldNames()).toEqual([
          "ID",
          "Product ID",
          "Quantity",
          "Subtotal",
          "Tax",
          "Total",
          "User ID",
        ]),
      );

      await userEvent.click(
        within(getSortOrderInput()).getByLabelText("Auto order"),
      );
      await waitFor(() =>
        expect(getTablePutBodies(ORDERS_ID)).toEqual([
          { field_order: "alphabetical" },
          { field_order: "smart" },
        ]),
      );
      await assertAndCloseToast("Field order updated");
      expect(getSortOrderRadio("smart")).toBeChecked();
      await waitFor(() =>
        expect(getSortableFieldNames()).toEqual([
          "ID",
          "Subtotal",
          "Tax",
          "Total",
          "Quantity",
          "User ID",
          "Product ID",
        ]),
      );
    });

    it("should allow switching from a custom order to a predefined order without a loading state (metabase#56482)", async () => {
      await setup({
        area,
        tableId: ORDERS_ID,
        tablePatch: { [ORDERS_ID]: { field_order: "custom" } },
        fieldPatch: {
          [ORDERS.USER_ID]: { position: 0 },
          [ORDERS.ID]: { position: 1 },
        },
      });

      await userEvent.click(
        within(getTableSection()).getByRole("button", { name: /Sorting/ }),
      );
      expect(getSortOrderRadio("custom")).toBeChecked();
      expect(getSortableFieldNames().slice(0, 2)).toEqual(["User ID", "ID"]);

      await userEvent.click(
        within(getSortOrderInput()).getByLabelText("Database order"),
      );
      await waitFor(() =>
        expect(getTablePutBodies(ORDERS_ID)).toEqual([
          { field_order: "database" },
        ]),
      );
      await assertAndCloseToast("Field order updated");

      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
      // the table section was not remounted, so it is still in sorting mode
      expect(getSortOrderRadio("database")).toBeChecked();
      await waitFor(() =>
        expect(getSortableFieldNames().slice(0, 2)).toEqual(["ID", "User ID"]),
      );
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

function getTablePutBodies(tableId: TableId): unknown[] {
  return fetchMock.callHistory
    .calls(`table-${tableId}-put`)
    .map((call) => JSON.parse(String(call.options.body)));
}

async function findTablePickerItem(name: string) {
  return await waitFor(() => {
    const items = screen
      .getAllByTestId("tree-item")
      .filter(
        (item) =>
          item.getAttribute("data-type") === "table" &&
          item.textContent?.includes(name),
      );
    expect(items).toHaveLength(1);
    return items[0];
  });
}

async function findTableNameInput(name: string) {
  return await waitFor(() => within(getTableSection()).getByDisplayValue(name));
}

async function clickFieldsTab() {
  await userEvent.click(screen.getByRole("tab", { name: /Fields/ }));
}

function getTableSectionFieldDescriptionInput(name: string) {
  return within(
    within(getTableSection()).getByRole("listitem", { name }),
  ).getByPlaceholderText("No description yet");
}

function getSortOrderInput() {
  return within(getTableSection()).getByRole("radiogroup", {
    name: "Column order",
  });
}

function getSortOrderRadio(value: string) {
  return within(getSortOrderInput()).getByDisplayValue(value);
}

function getSortableFieldNames() {
  return within(getTableSection())
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label"));
}
