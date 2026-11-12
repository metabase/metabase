import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardDataset,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  createMockDOMRect,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import {
  dismissToasts,
  findShownListbox,
  findToast,
  selectOption,
  typeAndBlur,
  undo,
} from "metabase/metadata/pages/shared/tests/helpers";
import {
  getLastRequestBody,
  getRequestBodies,
  setupDataModelBackend,
} from "metabase/metadata/pages/shared/tests/setup-data-model-backend";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Database, FieldId, FieldValue, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  PEOPLE,
  PRODUCTS,
  REVIEWS,
  createOrdersDiscountField,
  createOrdersIdField,
  createOrdersQuantityField,
  createOrdersTable,
  createOrdersUserIdField,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DataModelV1 } from "./DataModelV1";
import type { ParsedRouteParams } from "./types";

registerVisualizations();

const ORDERS_TABLE = createOrdersTable({
  description: "Confirmed Sample Company orders for a product, from a user.",
  field_order: "database",
  fields: [
    createOrdersIdField({ position: 0 }),
    createOrdersUserIdField({ position: 1 }),
    createOrdersDiscountField({ position: 2 }),
    createOrdersQuantityField({
      position: 3,
      description: "Number of products bought.",
    }),
  ],
});

const PEOPLE_TABLE = createPeopleTable();

const PRODUCTS_TABLE = createProductsTable();

const REVIEWS_TABLE = createReviewsTable({
  fields: createReviewsTable().fields?.map((field) =>
    field.id === REVIEWS.RATING
      ? { ...field, has_field_values: "list" }
      : field,
  ),
});

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE, PEOPLE_TABLE, PRODUCTS_TABLE, REVIEWS_TABLE],
});

const NUM_FIELD_ID: FieldId = 1001;

const NUM_FIELD = createMockField({
  id: NUM_FIELD_ID,
  table_id: 1000,
  name: "NUM",
  display_name: "Num",
  base_type: "type/Integer",
  effective_type: "type/Integer",
  semantic_type: null,
  has_field_values: "list",
});

const NUMBER_WITH_NULLS_TABLE = createMockTable({
  id: 1000,
  db_id: 1000,
  name: "NUMBER_WITH_NULLS",
  display_name: "Number With Nulls",
  schema: "main",
  fields: [NUM_FIELD],
});

const SQLITE_DB = createMockDatabase({
  id: 1000,
  name: "sqlite",
  engine: "sqlite",
  tables: [NUMBER_WITH_NULLS_TABLE],
});

const JSON_FIELD_ID: FieldId = 2001;

const JSON_FIELD = createMockField({
  id: JSON_FIELD_ID,
  table_id: 2000,
  name: "json",
  display_name: "Json",
  base_type: "type/JSON",
  effective_type: "type/JSON",
  semantic_type: null,
  json_unfolding: true,
  position: 0,
});

const JSON_A_FIELD_ID: FieldId = 2002;

const JSON_A_FIELD = createMockField({
  id: JSON_A_FIELD_ID,
  table_id: 2000,
  name: "json.a",
  display_name: "Json → A",
  base_type: "type/Integer",
  effective_type: "type/Integer",
  semantic_type: null,
  nfc_path: ["json", "a"],
  position: 1,
});

const JSON_D_FIELD = createMockField({
  id: 2003,
  table_id: 2000,
  name: "json.d",
  display_name: "Json → D",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: null,
  nfc_path: ["json", "d"],
  position: 2,
});

const MANY_DATA_TYPES_TABLE = createMockTable({
  id: 2000,
  db_id: 2000,
  name: "many_data_types",
  display_name: "Many Data Types",
  schema: "public",
  fields: [JSON_FIELD, JSON_A_FIELD, JSON_D_FIELD],
});

const WRITABLE_DB = createMockDatabase({
  id: 2000,
  name: "Writable Postgres12",
  engine: "postgres",
  features: ["nested-field-columns"],
  tables: [MANY_DATA_TYPES_TABLE],
});

const QUANTITY_VALUES: FieldValue[] = [[0], [1], [2], [3]];

const RATING_VALUES: FieldValue[] = [[1], [2], [3], [4], [5]];

const TITLE_VALUES: FieldValue[] = [
  ["Aerodynamic Bronze Hat"],
  ["Rustic Paper Car"],
];

interface SetupOpts {
  database?: Database;
  table: Table;
  fieldId: FieldId;
  fieldValues?: Partial<Record<FieldId, FieldValue[]>>;
}

async function setup({
  database = SAMPLE_DB,
  table,
  fieldId,
  fieldValues = {
    [ORDERS.QUANTITY]: QUANTITY_VALUES,
    [REVIEWS.RATING]: RATING_VALUES,
    [PRODUCTS.TITLE]: TITLE_VALUES,
  },
}: SetupOpts) {
  const databases = [
    database,
    ...[SAMPLE_DB, SQLITE_DB, WRITABLE_DB].filter(
      ({ id }) => id !== database.id,
    ),
  ];
  const backend = setupDataModelBackend({
    tables: databases.flatMap((database) => database.tables ?? []),
    fieldValues,
  });
  setupDatabasesEndpoints(databases);
  setupCardDataset();

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ advanced_permissions: true }),
  });
  setupEnterpriseOnlyPlugin("feature_level_permissions");

  const params: ParsedRouteParams = {
    databaseId: database.id,
    schemaName: table.schema,
    tableId: table.id,
    fieldId,
  };

  renderWithProviders(
    <Route
      path="admin/datamodel/database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
      element={<DataModelV1 />}
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: Urls.dataModel(params),
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings,
      }),
    },
  );

  await waitForLoaderToBeRemoved();
  expect(await screen.findByTestId("field-section")).toBeInTheDocument();

  return { backend };
}

describe("DataModelV1 > field section (advanced permissions)", () => {
  beforeEach(() => {
    // so the virtual list renders correctly in the tests
    mockGetBoundingClientRect();
    jest.spyOn(Analytics, "trackSimpleEvent");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("display values", () => {
    it("should explain why remapping options are disabled and not apply them", async () => {
      await setup({ table: PRODUCTS_TABLE, fieldId: PRODUCTS.TITLE });

      await userEvent.click(await findDisplayValuesInput());
      const listbox = await findShownListbox();

      const fkOption = within(listbox).getByRole("option", {
        name: /Use foreign key/,
      });
      expect(fkOption).toHaveAttribute("data-combobox-disabled", "true");
      await userEvent.hover(within(fkOption).getByLabelText("info icon"));
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        'You can only use foreign key mapping for fields with the semantic type set to "Foreign Key"',
      );
      await userEvent.unhover(within(fkOption).getByLabelText("info icon"));

      const customOption = await within(listbox).findByRole("option", {
        name: /Custom mapping/,
      });
      expect(customOption).toHaveAttribute("data-combobox-disabled", "true");
      await userEvent.hover(
        await within(customOption).findByLabelText("info icon"),
      );
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          'You can only use custom mapping for numerical fields with filtering set to "A list of all values"',
        );
      });

      // pointer-events: none in the browser, so force the click
      customOption.click();
      expect(await findDisplayValuesInput()).toHaveValue("Use original value");
      expect(
        fetchMock.callHistory.called(
          `stateful-field-${PRODUCTS.TITLE}-dimension-post`,
        ),
      ).toBe(false);
    });

    it("should allow 'Custom mapping' only for the 'A list of all values' filtering type (metabase#16322)", async () => {
      await setup({ table: REVIEWS_TABLE, fieldId: REVIEWS.RATING });
      const putRoute = `stateful-field-${REVIEWS.RATING}-put`;

      await selectOption(getFieldFilteringInput(), "Search box");
      await waitFor(() => {
        expect(getLastRequestBody(putRoute)).toEqual({
          has_field_values: "search",
        });
      });
      await findToast("Filtering of Rating updated");
      await dismissToasts();

      await userEvent.click(await findDisplayValuesInput());
      const customOption = await findCustomMappingOption();
      await waitFor(() => {
        expect(customOption).toHaveAttribute("data-combobox-disabled", "true");
      });
      await userEvent.hover(
        await within(customOption).findByLabelText("info icon"),
      );
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        'You can only use custom mapping for numerical fields with filtering set to "A list of all values"',
      );

      // close the popover by clicking on an element inside the panel
      await userEvent.click(
        within(getFieldSection()).getByText("Field settings"),
      );

      await selectOption(getFieldFilteringInput(), "A list of all values");
      await waitFor(() => {
        expect(getLastRequestBody(putRoute)).toEqual({
          has_field_values: "list",
        });
      });
      await findToast("Filtering of Rating updated");

      await userEvent.click(await findDisplayValuesInput());
      await waitFor(async () => {
        expect(await findCustomMappingOption()).not.toHaveAttribute(
          "data-combobox-disabled",
        );
      });
    });

    it("should allow 'Custom mapping' null values", async () => {
      await setup({
        database: SQLITE_DB,
        table: NUMBER_WITH_NULLS_TABLE,
        fieldId: NUM_FIELD_ID,
        fieldValues: { [NUM_FIELD_ID]: [[1], [null], [2]] },
      });
      const valuesRoute = `stateful-field-${NUM_FIELD_ID}-values-post`;

      await selectOption(await findDisplayValuesInput(), "Custom mapping");

      await waitFor(() => {
        expect(getLastRequestBody(valuesRoute)).toEqual({
          values: [
            [1, "1"],
            [null, "null"],
            [2, "2"],
          ],
        });
      });
      expect(
        getLastRequestBody(`stateful-field-${NUM_FIELD_ID}-dimension-post`),
      ).toEqual({
        type: "internal",
        name: "Num",
        human_readable_field_id: null,
      });
      expect(Analytics.trackSimpleEvent).toHaveBeenCalledWith({
        event: "metadata_edited",
        event_detail: "display_values",
        triggered_from: "admin",
      });
      await findToast("Display values of Num updated");
      await dismissToasts();

      const modal = await screen.findByRole("dialog");
      const nullInput = within(modal).getByDisplayValue("null");
      await userEvent.clear(nullInput);
      await userEvent.type(nullInput, "nothin");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Save" }),
      );

      await waitFor(() => {
        expect(getRequestBodies(valuesRoute)).toHaveLength(2);
      });
      expect(getLastRequestBody(valuesRoute)).toEqual({
        values: [
          [1, "1"],
          [null, "nothin"],
          [2, "2"],
        ],
      });
      await findToast("Display values of Num updated");
    });
  });

  describe("prefix of JSON-unfolded fields", () => {
    beforeEach(() => {
      // a single-line text is truncated when its text is wider than its box
      jest
        .spyOn(window.Range.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Range) {
          return createMockDOMRect({
            width: this.toString().length * 10,
            height: 20,
          });
        });
    });

    function setupWithPrefix(prefix: string) {
      return setup({
        database: createMockDatabase({
          ...WRITABLE_DB,
          tables: [
            {
              ...MANY_DATA_TYPES_TABLE,
              fields: [
                { ...JSON_FIELD, display_name: prefix },
                JSON_A_FIELD,
                JSON_D_FIELD,
              ],
            },
          ],
        }),
        table: MANY_DATA_TYPES_TABLE,
        fieldId: JSON_A_FIELD_ID,
      });
    }

    it("should update the prefix when the parent field is renamed", async () => {
      await setup({
        database: WRITABLE_DB,
        table: MANY_DATA_TYPES_TABLE,
        fieldId: JSON_A_FIELD_ID,
      });

      expect(getFieldSectionPrefix()).toHaveTextContent(/^Json:$/);
      expect(getTableSectionFieldPrefix("Json → D")).toHaveTextContent(
        /^Json:$/,
      );

      const parentNameInput = within(
        getTableSectionField("Json"),
      ).getByPlaceholderText("Give this field a name");
      await userEvent.clear(parentNameInput);
      await userEvent.type(parentNameInput, "Short prefix");
      await userEvent.tab();

      await waitFor(() => {
        expect(getFieldSectionPrefix()).toHaveTextContent(/^Short prefix:$/);
      });
      expect(getTableSectionFieldPrefix("Json → D")).toHaveTextContent(
        /^Short prefix:$/,
      );
      expect(getLastRequestBody(`stateful-field-${JSON_FIELD_ID}-put`)).toEqual(
        { display_name: "Short prefix" },
      );
    });

    it("should not show a tooltip for a short prefix", async () => {
      await setupWithPrefix("Short prefix");

      expect(getFieldSectionPrefix()).toHaveTextContent(/^Short prefix:$/);
      await userEvent.hover(getFieldSectionPrefix());
      expect(getTableSectionFieldPrefix("Json → D")).toHaveTextContent(
        /^Short prefix:$/,
      );
      await userEvent.hover(getTableSectionFieldPrefixText("Json → D"));

      // wait past the tooltip open delay
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("should show the full prefix in a tooltip when a long prefix is truncated", async () => {
      const longPrefix = "Legendarily long column prefix";
      await setupWithPrefix(longPrefix);

      expect(getFieldSectionPrefix()).toHaveTextContent(`${longPrefix}:`);
      await userEvent.hover(getFieldSectionPrefix());
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        new RegExp(`^${longPrefix}$`),
      );
      await userEvent.unhover(getFieldSectionPrefix());
      await waitFor(() => {
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });

      expect(getTableSectionFieldPrefix("Json → D")).toHaveTextContent(
        `${longPrefix}:`,
      );
      await userEvent.hover(getTableSectionFieldPrefixText("Json → D"));
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        new RegExp(`^${longPrefix}$`),
      );
    });
  });

  describe("formatting", () => {
    it("should save the number style of a field", async () => {
      await setup({ table: ORDERS_TABLE, fieldId: ORDERS.QUANTITY });

      await userEvent.click(
        within(
          screen.getByTestId("chart-settings-widget-number_style"),
        ).getByText("123%"),
      );

      await waitFor(() => {
        expect(
          getLastRequestBody(`stateful-field-${ORDERS.QUANTITY}-put`),
        ).toEqual({ settings: { number_style: "percent" } });
      });
      expect(Analytics.trackSimpleEvent).toHaveBeenCalledWith({
        event: "metadata_edited",
        event_detail: "formatting",
        triggered_from: "admin",
      });
      await findToast("Formatting of Quantity updated");

      // the feature_level_permissions plugin asks for the editable data model
      const metadataUrls = fetchMock.callHistory
        .calls(`stateful-table-${ORDERS_TABLE.id}-query-metadata`)
        .map((call) => new URL(call.url).searchParams);
      expect(metadataUrls.length).toBeGreaterThan(0);
      metadataUrls.forEach((params) => {
        expect(params.get("include_editable_data_model")).toBe("true");
      });
    });

    it("should show currency formatting options for currency fields", async () => {
      await setup({ table: ORDERS_TABLE, fieldId: ORDERS.DISCOUNT });

      const settings = screen.getByTestId("column-settings");
      expect(within(settings).getByText("Unit of currency")).toBeVisible();
      expect(within(settings).getByText("Currency label style")).toBeVisible();
    });

    it("should show currency formatting options for other fields only once the currency style is chosen", async () => {
      await setup({ table: ORDERS_TABLE, fieldId: ORDERS.QUANTITY });

      const settings = screen.getByTestId("column-settings");
      expect(
        within(settings).queryByText("Unit of currency"),
      ).not.toBeVisible();
      expect(
        within(settings).queryByText("Currency label style"),
      ).not.toBeVisible();

      await userEvent.click(
        within(
          screen.getByTestId("chart-settings-widget-number_style"),
        ).getByText("$1.23"),
      );

      await findToast("Formatting of Quantity updated");
      expect(
        getLastRequestBody(`stateful-field-${ORDERS.QUANTITY}-put`),
      ).toEqual({ settings: { number_style: "currency" } });
      await waitFor(() => {
        expect(
          within(screen.getByTestId("column-settings")).getByText(
            "Unit of currency",
          ),
        ).toBeVisible();
      });
      expect(
        within(screen.getByTestId("column-settings")).getByText(
          "Currency label style",
        ),
      ).toBeVisible();
    });

    it("should not update the field when the prefix or suffix has not changed (SEM-359)", async () => {
      await setup({ table: ORDERS_TABLE, fieldId: ORDERS.QUANTITY });
      const putRoute = `stateful-field-${ORDERS.QUANTITY}-put`;

      await userEvent.click(screen.getByTestId("prefix"));
      await userEvent.tab();
      await userEvent.click(screen.getByTestId("suffix"));
      await userEvent.tab();

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fetchMock.callHistory.called(putRoute)).toBe(false);
      expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();

      await userEvent.type(screen.getByTestId("suffix"), " items");
      await userEvent.tab();

      await findToast("Formatting of Quantity updated");
      expect(getRequestBodies(putRoute)).toEqual([
        { settings: { suffix: " items" } },
      ]);
    });
  });

  describe("undo", () => {
    it("should undo the changes of the table section", async () => {
      const { backend } = await setup({
        table: ORDERS_TABLE,
        fieldId: ORDERS.QUANTITY,
      });
      const tablePutRoute = `stateful-table-${ORDERS_TABLE.id}-put`;
      const fieldPutRoute = `stateful-field-${ORDERS.QUANTITY}-put`;

      await typeAndBlur(getTableNameInput(), "a");
      await undo("Table name updated");
      expect(getRequestBodies(tablePutRoute)).toEqual([
        { display_name: "Ordersa" },
        { display_name: "Orders" },
      ]);
      await waitFor(() => expect(getTableNameInput()).toHaveValue("Orders"));

      await typeAndBlur(getTableDescriptionInput(), "a");
      await undo("Table description updated");
      expect(getLastRequestBody(tablePutRoute)).toEqual({
        description: ORDERS_TABLE.description,
      });
      await waitFor(() =>
        expect(getTableDescriptionInput()).toHaveValue(
          ORDERS_TABLE.description,
        ),
      );

      await userEvent.click(
        within(getTableSection()).getByRole("button", { name: /Sorting/ }),
      );
      await userEvent.click(
        within(getSortOrderInput()).getByLabelText("Alphabetical order"),
      );
      await undo("Field order updated");
      expect(getRequestBodies(tablePutRoute).slice(-2)).toEqual([
        { field_order: "alphabetical" },
        { field_order: "database" },
      ]);
      await waitFor(() =>
        expect(
          within(getSortOrderInput()).getByDisplayValue("database"),
        ).toBeChecked(),
      );
      expect(backend.getTable(ORDERS_TABLE.id).field_order).toBe("database");
      await userEvent.click(
        within(getTableSection()).getByRole("button", { name: /Done/ }),
      );

      await typeAndBlur(
        within(getTableSectionField("Quantity")).getByPlaceholderText(
          "Give this field a name",
        ),
        "a",
      );
      await undo("Name of Quantity updated");
      expect(getRequestBodies(fieldPutRoute)).toEqual([
        { display_name: "Quantitya" },
        { display_name: "Quantity" },
      ]);
      await waitFor(() =>
        expect(
          within(getTableSectionField("Quantity")).getByPlaceholderText(
            "Give this field a name",
          ),
        ).toHaveValue("Quantity"),
      );

      await typeAndBlur(
        within(getTableSectionField("Quantity")).getByPlaceholderText(
          "No description yet",
        ),
        "a",
      );
      await undo("Description of Quantity updated");
      expect(getLastRequestBody(fieldPutRoute)).toEqual({
        description: "Number of products bought.",
      });
      await waitFor(() =>
        expect(
          within(getTableSectionField("Quantity")).getByPlaceholderText(
            "No description yet",
          ),
        ).toHaveValue("Number of products bought."),
      );
    });

    it("should undo the changes of the field section", async () => {
      await setup({ table: ORDERS_TABLE, fieldId: ORDERS.QUANTITY });
      const putRoute = `stateful-field-${ORDERS.QUANTITY}-put`;

      await typeAndBlur(getFieldNameInput(), "a");
      await undo("Name of Quantity updated");
      expect(getLastRequestBody(putRoute)).toEqual({
        display_name: "Quantity",
      });
      await waitFor(() => expect(getFieldNameInput()).toHaveValue("Quantity"));

      await typeAndBlur(getFieldDescriptionInput(), "a");
      await undo("Description of Quantity updated");
      expect(getLastRequestBody(putRoute)).toEqual({
        description: "Number of products bought.",
      });
      await waitFor(() =>
        expect(getFieldDescriptionInput()).toHaveValue(
          "Number of products bought.",
        ),
      );

      await userEvent.click(getCoercionToggle());
      await userEvent.click(
        within(await findShownListbox()).getByText("UNIX seconds → Datetime"),
      );
      await undo("Casting enabled for Quantity");
      expect(getRequestBodies(putRoute).slice(-2)).toEqual([
        { coercion_strategy: "Coercion/UNIXSeconds->DateTime" },
        { coercion_strategy: null },
      ]);
      await waitFor(() => expect(getCoercionToggle()).not.toBeChecked());

      await selectOption(getSemanticTypeInput(), "Score");
      await undo("Semantic type of Quantity updated");
      expect(getLastRequestBody(putRoute)).toEqual({
        semantic_type: "type/Quantity",
        fk_target_field_id: null,
      });
      await waitFor(() =>
        expect(getSemanticTypeInput()).toHaveValue("Quantity"),
      );

      await selectOption(getVisibilityInput(), "Only in detail views");
      await undo("Visibility of Quantity updated");
      expect(getLastRequestBody(putRoute)).toEqual({
        visibility_type: "normal",
      });
      await waitFor(() =>
        expect(getVisibilityInput()).toHaveValue("Everywhere"),
      );

      await selectOption(getFieldFilteringInput(), "Search box");
      await undo("Filtering of Quantity updated");
      expect(getLastRequestBody(putRoute)).toEqual({
        has_field_values: "list",
      });
      await waitFor(() =>
        expect(getFieldFilteringInput()).toHaveValue("A list of all values"),
      );
    });

    it("should undo the changes of display values", async () => {
      const { backend } = await setup({
        table: ORDERS_TABLE,
        fieldId: ORDERS.QUANTITY,
      });
      const valuesRoute = `stateful-field-${ORDERS.QUANTITY}-values-post`;

      await selectOption(await findDisplayValuesInput(), "Custom mapping");
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Cancel",
        }),
      );
      await undo("Display values of Quantity updated");
      await waitFor(() =>
        expect(
          fetchMock.callHistory.called(
            `stateful-field-${ORDERS.QUANTITY}-dimension-delete`,
          ),
        ).toBe(true),
      );
      await waitFor(async () =>
        expect(await findDisplayValuesInput()).toHaveValue(
          "Use original value",
        ),
      );

      await selectOption(await findDisplayValuesInput(), "Custom mapping");
      await findToast("Display values of Quantity updated");
      await dismissToasts();
      const modal = await screen.findByRole("dialog");
      const input = await within(modal).findByDisplayValue("1");
      await userEvent.clear(input);
      await userEvent.type(input, "XYZ");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Save" }),
      );
      await waitFor(() =>
        expect(getLastRequestBody(valuesRoute)).toEqual({
          values: [
            [0, "0"],
            [1, "XYZ"],
            [2, "2"],
            [3, "3"],
          ],
        }),
      );
      await undo("Display values of Quantity updated");
      await waitFor(() =>
        expect(getLastRequestBody(valuesRoute)).toEqual({
          values: [
            [0, "0"],
            [1, "1"],
            [2, "2"],
            [3, "3"],
          ],
        }),
      );
      expect(backend.getFieldValues(ORDERS.QUANTITY)).toEqual([
        [0, "0"],
        [1, "1"],
        [2, "2"],
        [3, "3"],
      ]);

      await userEvent.click(
        within(getFieldSection()).getByRole("button", { name: "Edit mapping" }),
      );
      const editModal = await screen.findByRole("dialog");
      const restoredInput = await within(editModal).findByDisplayValue("1");
      await waitFor(() => expect(restoredInput).toBeVisible());
      expect(
        within(editModal).queryByDisplayValue("XYZ"),
      ).not.toBeInTheDocument();
    });

    it("should undo the foreign key display values", async () => {
      await setup({ table: ORDERS_TABLE, fieldId: ORDERS.USER_ID });

      await selectOption(await findDisplayValuesInput(), "Use foreign key");
      await waitFor(() =>
        expect(
          getLastRequestBody(`stateful-field-${ORDERS.USER_ID}-dimension-post`),
        ).toEqual({
          type: "external",
          name: "User ID",
          human_readable_field_id: PEOPLE.NAME,
        }),
      );
      expect(await screen.findByPlaceholderText("Choose a field")).toHaveValue(
        "Name",
      );

      await undo("Display values of User ID updated");
      await waitFor(() =>
        expect(
          fetchMock.callHistory.called(
            `stateful-field-${ORDERS.USER_ID}-dimension-delete`,
          ),
        ).toBe(true),
      );
      await waitFor(async () =>
        expect(await findDisplayValuesInput()).toHaveValue(
          "Use original value",
        ),
      );
    });

    it("should undo JSON unfolding", async () => {
      await setup({
        database: WRITABLE_DB,
        table: MANY_DATA_TYPES_TABLE,
        fieldId: JSON_FIELD_ID,
      });
      const putRoute = `stateful-field-${JSON_FIELD_ID}-put`;

      await selectOption(await findUnfoldJsonInput(), "No");
      await undo("JSON unfolding disabled for Json");
      expect(getRequestBodies(putRoute)).toEqual([
        { json_unfolding: false },
        { json_unfolding: true },
      ]);
      await waitFor(async () =>
        expect(await findUnfoldJsonInput()).toHaveValue("Yes"),
      );
    });

    it("should undo formatting changes", async () => {
      await setup({ table: ORDERS_TABLE, fieldId: ORDERS.QUANTITY });
      const putRoute = `stateful-field-${ORDERS.QUANTITY}-put`;

      await typeAndBlur(screen.getByTestId("prefix"), "5");
      await undo("Formatting of Quantity updated");
      expect(getRequestBodies(putRoute)).toEqual([
        { settings: { prefix: "5" } },
        { settings: {} },
      ]);
      await waitFor(() => expect(screen.getByTestId("prefix")).toHaveValue(""));

      await typeAndBlur(getMultiplyByNumberInput(), "5");
      await undo("Formatting of Quantity updated");
      expect(getRequestBodies(putRoute).slice(-2)).toEqual([
        { settings: { scale: 5 } },
        { settings: {} },
      ]);
      await waitFor(() => expect(getMultiplyByNumberInput()).toHaveValue(""));

      await userEvent.click(getMiniBarChartToggle());
      await undo("Formatting of Quantity updated");
      expect(getRequestBodies(putRoute).slice(-2)).toEqual([
        { settings: { show_mini_bar: true } },
        { settings: {} },
      ]);
      await waitFor(() => expect(getMiniBarChartToggle()).not.toBeChecked());
    });
  });
});

async function findCustomMappingOption() {
  return within(await findShownListbox()).findByRole("option", {
    name: /Custom mapping/,
  });
}

/** table section helpers */

function getTableSection() {
  return screen.getByTestId("table-section");
}

function getTableNameInput() {
  return within(getTableSection()).getByPlaceholderText(
    "Give this table a name",
  );
}

function getTableDescriptionInput() {
  return within(getTableSection()).getByPlaceholderText(
    "Give this table a description",
  );
}

function getSortOrderInput() {
  return within(getTableSection()).getByRole("radiogroup", {
    name: "Column order",
  });
}

function getTableSectionField(name: string) {
  return within(getTableSection()).getByLabelText(name);
}

function getTableSectionFieldPrefix(name: string) {
  return within(getTableSectionField(name)).getByTestId("name-prefix");
}

/** the tooltip listens on the text, not on the box that has the test id */
function getTableSectionFieldPrefixText(name: string) {
  return within(getTableSectionFieldPrefix(name)).getByText(/:$/);
}

/** field section helpers */

function getFieldSection() {
  return screen.getByTestId("field-section");
}

function getFieldSectionPrefix() {
  return within(getFieldSection()).getByTestId("name-prefix");
}

function getFieldNameInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Give this field a name",
  );
}

function getFieldDescriptionInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Give this field a description",
  );
}

function getCoercionToggle() {
  return within(getFieldSection()).getByLabelText(
    "Cast to a specific data type",
  );
}

function getSemanticTypeInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select a semantic type",
  );
}

function getVisibilityInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select a field visibility",
  );
}

function getFieldFilteringInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select field filtering",
  );
}

async function findDisplayValuesInput() {
  return within(getFieldSection()).findByPlaceholderText(
    "Select display values",
  );
}

async function findUnfoldJsonInput() {
  return within(getFieldSection()).findByPlaceholderText(
    "Select whether to unfold JSON",
  );
}

function getMultiplyByNumberInput() {
  return within(getFieldSection()).getByLabelText("Multiply by a number");
}

function getMiniBarChartToggle() {
  return within(getFieldSection()).getByLabelText("Show a mini bar chart");
}
