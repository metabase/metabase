import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardDataset,
  setupDatabaseIdFieldsEndpoints,
  setupDatabasesEndpoints,
  setupFieldsValuesEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
  setupUnauthorizedFieldEndpoint,
  setupUnauthorizedFieldValuesEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  act,
  createMockDOMRect,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { Link } from "metabase/common/components/Link";
import {
  dismissToasts,
  findShownListbox,
  findToast,
  flushRequests,
  selectOption,
  undo,
} from "metabase/metadata/pages/shared/tests/helpers";
import {
  getLastRequestBody,
  getRequestBodies,
  setupDataModelBackend,
} from "metabase/metadata/pages/shared/tests/setup-data-model-backend";
import { Route, redirect } from "metabase/router";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  Database,
  Field,
  GetFieldValuesResponse,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockFieldDimension,
  createMockFieldValues,
  createMockSearchResult,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS_ID,
  REVIEWS_ID,
  SAMPLE_DB_FIELD_VALUES,
  SAMPLE_DB_ID,
  createOrdersDiscountField,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersQuantityField,
  createOrdersTable,
  createOrdersUserIdField,
  createPeopleTable,
  createProductsIdField,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DataModelV1 } from "./DataModelV1";
import type { ParsedRouteParams } from "./types";

registerVisualizations();

const DEFAULT_ROUTE_PARAMS: ParsedRouteParams = {
  databaseId: undefined,
  schemaName: undefined,
  tableId: undefined,
  fieldId: undefined,
};

const ORDERS_ID_FIELD = createOrdersIdField();

const ORDERS_PRODUCT_ID_FIELD = createOrdersProductIdField();

const ORDERS_USER_ID_FIELD = createOrdersUserIdField();

const ORDERS_DISCOUNT_FIELD = createOrdersDiscountField();

const ORDERS_QUANTITY_FIELD = createOrdersQuantityField({
  dimensions: [
    createMockFieldDimension({
      type: "internal",
      name: "Quantity",
    }),
  ],
});

const ORDERS_TABLE = createOrdersTable({
  fields: [
    ORDERS_ID_FIELD,
    ORDERS_PRODUCT_ID_FIELD,
    ORDERS_USER_ID_FIELD,
    ORDERS_DISCOUNT_FIELD,
    ORDERS_QUANTITY_FIELD,
  ],
  visibility_type: "technical",
});

const PRODUCTS_ID_FIELD = createProductsIdField();

const PRODUCTS_TABLE = createProductsTable({
  fields: [PRODUCTS_ID_FIELD],
});

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE, PRODUCTS_TABLE],
});

const PEOPLE_TABLE_MULTI_SCHEMA = createPeopleTable({
  db_id: 2,
});

const REVIEWS_TABLE_MULTI_SCHEMA = createReviewsTable({
  db_id: 2,
  schema: "PRIVATE",
});

const SAMPLE_DB_MULTI_SCHEMA = createSampleDatabase({
  id: 2,
  name: "Multi schema",
  tables: [PEOPLE_TABLE_MULTI_SCHEMA, REVIEWS_TABLE_MULTI_SCHEMA],
});

const ORDERS_TABLE_NO_SCHEMA = createOrdersTable({
  schema: "",
});

const SAMPLE_DB_NO_SCHEMA = createSampleDatabase({
  name: "No schema",
  tables: [ORDERS_TABLE_NO_SCHEMA],
});

const ORDERS_TABLE_INITIAL_SYNC_INCOMPLETE = createOrdersTable({
  initial_sync_status: "incomplete",
});

const SAMPLE_DB_WITH_INITIAL_SYNC_INCOMPLETE = createSampleDatabase({
  name: "Initial sync incomplete",
  tables: [ORDERS_TABLE_INITIAL_SYNC_INCOMPLETE],
});

const JSON_FIELD_ROOT = createMockField({
  id: 1,
  name: "JSON",
  display_name: "Json",
  base_type: "type/JSON",
});

const JSON_FIELD_NESTED = createMockField({
  id: 2,
  name: "version",
  display_name: "Version",
  parent_id: JSON_FIELD_ROOT.id,
  nfc_path: ["JSON", "version"],
});

const JSON_TABLE = createMockTable({
  fields: [JSON_FIELD_ROOT, JSON_FIELD_NESTED],
});

const JSON_DB = createMockDatabase({
  tables: [JSON_TABLE],
  features: ["nested-field-columns"],
});

interface SetupOpts {
  databases?: Database[];
  fieldValues?: GetFieldValuesResponse[];
  hasFieldValuesAccess?: boolean;
  initialRoute?: string;
  params?: ParsedRouteParams;
  unauthorizedField?: Field;
  waitForDatabase?: boolean;
  waitForTable?: boolean;
  shouldSkipTableMocks?: boolean;
}

const OtherComponent = () => {
  return (
    <>
      <span>Another route</span>
      <Link to="admin/datamodel">Link to Data Model</Link>
    </>
  );
};

async function setup({
  databases = [SAMPLE_DB],
  fieldValues = SAMPLE_DB_FIELD_VALUES,
  hasFieldValuesAccess = true,
  initialRoute,
  params = DEFAULT_ROUTE_PARAMS,
  unauthorizedField,
  waitForDatabase = true,
  waitForTable = true,
  shouldSkipTableMocks = false,
}: SetupOpts = {}) {
  setupDatabasesEndpoints(databases);
  setupCardDataset();

  if (!shouldSkipTableMocks) {
    setupTableEndpoints(createPeopleTable());
  }

  if (hasFieldValuesAccess) {
    setupFieldsValuesEndpoints(fieldValues);
  }

  if (unauthorizedField) {
    setupUnauthorizedFieldEndpoint(unauthorizedField);
    setupUnauthorizedFieldValuesEndpoints(unauthorizedField.id);
  }

  const { router } = renderWithProviders(
    <>
      <Route path="notAdmin" element={<OtherComponent />} />
      <Route path="admin/datamodel">
        <Route index element={redirect("database")} />
        <Route path="database" element={<DataModelV1 />} />
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
    </>,
    {
      withRouter: true,
      initialRoute: initialRoute ?? Urls.dataModel(params),
    },
  );

  if (waitForDatabase) {
    expect(
      await findTablePickerDatabase(databases[0].name),
    ).toBeInTheDocument();
  }

  if (waitForTable) {
    const tableName = checkNotNull(databases[0].tables)[0].display_name;
    expect(await findTablePickerTable(tableName)).toBeInTheDocument();
  }

  await waitForLoaderToBeRemoved();

  return { router };
}

describe("DataModelV1", () => {
  beforeEach(() => {
    // so the virtual list renders correctly in the tests
    mockGetBoundingClientRect();
  });

  it("should show empty state by default", async () => {
    await setup();

    expect(screen.getByRole("link", { name: /Segments/ })).toBeInTheDocument();
    expect(
      screen.getByText("Start by selecting data to model"),
    ).toBeInTheDocument();
  });

  describe("no schema database", () => {
    it("should select the first database and skip schema selection by default", async () => {
      await setup({ databases: [SAMPLE_DB_NO_SCHEMA] });

      expect(
        await findTablePickerDatabase(SAMPLE_DB_NO_SCHEMA.name),
      ).toBeInTheDocument();
      expect(
        await findTablePickerTable(ORDERS_TABLE_NO_SCHEMA.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("single schema database", () => {
    it("should select the first database and the only schema by default", async () => {
      await setup();

      expect(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
      expect(screen.queryByText(ORDERS_TABLE.schema)).not.toBeInTheDocument();
    });

    it("should allow to search for a table", async () => {
      await setup();
      setupSearchEndpoints([
        createMockSearchResult({
          id: getNextId(),
          model: "table",
          name: ORDERS_TABLE.display_name,
          table_name: ORDERS_TABLE.display_name,
          table_schema: "public",
          database_name: SAMPLE_DB.name,
        }),
      ]);

      const searchValue = ORDERS_TABLE.name.substring(0, 3);
      await userEvent.type(getTableSearchInput(), searchValue);

      expect(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(PRODUCTS_TABLE.display_name),
      ).not.toBeInTheDocument();
    });

    it("should not allow to enter an empty table name", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await userEvent.clear(getTableNameInput());
      await userEvent.tab();

      expect(getTableNameInput()).toHaveValue(ORDERS_TABLE.display_name);
    });

    it("should not allow to enter an empty field name in table section", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_DISCOUNT_FIELD.display_name);
      await userEvent.clear(
        getTableSectionFieldNameInput(ORDERS_DISCOUNT_FIELD.display_name),
      );
      await userEvent.tab();

      expect(
        getTableSectionFieldNameInput(ORDERS_DISCOUNT_FIELD.display_name),
      ).toHaveValue(ORDERS_DISCOUNT_FIELD.display_name);
    });

    it("should not allow to enter an empty field name in field section", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_DISCOUNT_FIELD.display_name);
      await userEvent.clear(getFieldNameInput());
      await userEvent.tab();

      expect(getFieldNameInput()).toHaveValue(
        ORDERS_DISCOUNT_FIELD.display_name,
      );
    });

    it("should display visible tables", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(PRODUCTS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();

      expect(
        await getHideTableButton(PRODUCTS_TABLE.display_name),
      ).toBeInTheDocument();
    });

    it("should display hidden tables", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();

      expect(
        await getUnhideTableButton(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
    });

    it("clicking on tables with initial_sync_status='incomplete' should not navigate to the table", async () => {
      await setup({ databases: [SAMPLE_DB_WITH_INITIAL_SYNC_INCOMPLETE] });

      expect(
        screen.getByText("Start by selecting data to model"),
      ).toBeInTheDocument();

      expect(
        within(
          await findTablePickerTable(
            ORDERS_TABLE_INITIAL_SYNC_INCOMPLETE.display_name,
          ),
        ).queryByRole("button", {
          name: "Hide table",
        }),
      ).not.toBeInTheDocument();

      // This click should not cause a change, as the table should be disabled
      await expect(
        userEvent.click(
          await findTablePickerTable(
            ORDERS_TABLE_INITIAL_SYNC_INCOMPLETE.display_name,
          ),
        ),
      ).rejects.toThrow(/pointer-events: none/);

      expect(
        screen.getByText("Start by selecting data to model"),
      ).toBeInTheDocument();
    });

    it("should display sort options", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await userEvent.click(screen.getByRole("button", { name: /Sorting/ }));

      expect(screen.getByLabelText("Database order")).toBeInTheDocument();
      expect(screen.getByLabelText("Alphabetical order")).toBeInTheDocument();
      expect(screen.getByLabelText("Custom order")).toBeInTheDocument();
      expect(screen.getByLabelText("Auto order")).toBeInTheDocument();
    });

    it("should display field visibility options", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_DISCOUNT_FIELD.display_name);

      await userEvent.click(getFieldVisibilityInput());

      const popover = within(await screen.findByRole("listbox"));
      expect(popover.getByText("Everywhere")).toBeInTheDocument();
      expect(popover.getByText("Only in detail views")).toBeInTheDocument();
      expect(popover.getByText("Do not include")).toBeInTheDocument();
    });

    it("should allow to search for field semantic types", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_DISCOUNT_FIELD.display_name);

      const input = getFieldSemanticTypeInput();
      await userEvent.click(input);

      const popover = within(await screen.findByRole("listbox"));
      expect(popover.getByText("Currency")).toBeInTheDocument();

      await userEvent.clear(input);
      await userEvent.type(input, "In");

      expect(popover.getByText("Income")).toBeInTheDocument();
      expect(popover.queryByText("Currency")).not.toBeInTheDocument();
    });

    it("should show the foreign key target for foreign keys", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_PRODUCT_ID_FIELD.display_name);

      const input = getFieldSemanticTypeFkTargetInput();
      expect(input).toHaveValue("Products → ID");

      await userEvent.click(input);
      const popover = within(await screen.findByRole("listbox"));

      expect(popover.getByText("Products → ID")).toBeInTheDocument();
      expect(popover.getByText("Orders → ID")).toBeInTheDocument();

      await userEvent.clear(input);
      await userEvent.type(input, "Products");
      expect(popover.getByText("Products → ID")).toBeInTheDocument();
    });

    it("should show an access denied error if the foreign key field has an inaccessible target", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_USER_ID_FIELD.display_name);

      const input = getFieldSemanticTypeFkTargetInput();
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("");
      expect(input).toHaveAttribute("placeholder", "Field access denied");
    });

    it("should not show the foreign key target for non-foreign keys", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_ID_FIELD.display_name);

      expect(
        within(getFieldSection()).queryByLabelText("Foreign key target"),
      ).not.toBeInTheDocument();
    });

    it("should show currency settings for currency fields", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_DISCOUNT_FIELD.display_name);

      const currencyInput = within(getFieldSection()).getByPlaceholderText(
        "Select a currency type",
      );
      await userEvent.click(currencyInput);

      const popover = within(await screen.findByRole("listbox"));
      expect(popover.getByText("Canadian Dollar")).toBeInTheDocument();
      expect(popover.getByText("Euro")).toBeInTheDocument();

      await userEvent.clear(currencyInput);
      await userEvent.type(currencyInput, "Dollar");

      expect(popover.getByText("US Dollar")).toBeInTheDocument();
      expect(popover.getByText("Canadian Dollar")).toBeInTheDocument();
      expect(popover.queryByText("Euro")).not.toBeInTheDocument();
    });

    it("should not show currency settings for non-currency fields", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_ID_FIELD.display_name);

      expect(
        within(getFieldSection()).queryByPlaceholderText(
          "Select a currency type",
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe("multi schema database", () => {
    it("should not select the first schema if there are multiple schemas", async () => {
      await setup({
        databases: [SAMPLE_DB_MULTI_SCHEMA],
        waitForTable: false,
        shouldSkipTableMocks: true,
      });

      expect(
        await findTablePickerDatabase(SAMPLE_DB_MULTI_SCHEMA.name),
      ).toBeInTheDocument();
      expect(
        await findTablePickerSchema(PEOPLE_TABLE_MULTI_SCHEMA.schema),
      ).toBeInTheDocument();
      expect(
        await findTablePickerSchema(REVIEWS_TABLE_MULTI_SCHEMA.schema),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      ).not.toBeInTheDocument();
    });
  });

  describe("multiple databases", () => {
    it("should be able to switch databases", async () => {
      await setup({
        databases: [SAMPLE_DB, SAMPLE_DB_MULTI_SCHEMA],
        waitForTable: false,
        shouldSkipTableMocks: true,
      });

      expect(
        screen.queryByText(ORDERS_TABLE.display_name),
      ).not.toBeInTheDocument();
      await userEvent.click(await findTablePickerDatabase(SAMPLE_DB.name));
      expect(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();

      await userEvent.click(
        await findTablePickerDatabase(SAMPLE_DB_MULTI_SCHEMA.name),
      );

      expect(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();

      await userEvent.click(
        await findTablePickerSchema(PEOPLE_TABLE_MULTI_SCHEMA.schema),
      );
      expect(
        await findTablePickerTable(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("no databases", () => {
    // TODO: https://linear.app/metabase/issue/SEM-459/empty-state-when-there-are-no-databases
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should display an empty state", async () => {
      await setup({
        databases: [],
        waitForDatabase: false,
        waitForTable: false,
      });

      expect(
        screen.getByText("The page you asked for couldn't be found."),
      ).toBeInTheDocument();
    });
  });

  describe("databases with json fields", () => {
    it("should display unfolded json fields", async () => {
      await setup({ databases: [JSON_DB] });

      await userEvent.click(
        await findTablePickerTable(JSON_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();

      expect(getTableNameInput()).toBeInTheDocument();
      expect(getTableNameInput()).toHaveValue(JSON_TABLE.display_name);

      expect(
        getTableSectionFieldNameInput(JSON_FIELD_ROOT.display_name),
      ).toBeInTheDocument();
      expect(
        getTableSectionFieldNameInput(JSON_FIELD_NESTED.display_name),
      ).toBeInTheDocument();

      expect(
        getTableSectionField(JSON_FIELD_NESTED.display_name),
      ).toHaveTextContent(`${JSON_FIELD_ROOT.display_name}:`);
    });

    describe("navigation", () => {
      it("should replace locations in history stack when being routed automatically", async () => {
        const { router } = await setup({
          initialRoute: "notAdmin",
          waitForDatabase: false,
          waitForTable: false,
        });

        expect(screen.getByText("Link to Data Model")).toBeInTheDocument();
        await userEvent.click(
          screen.getByRole("link", { name: "Link to Data Model" }),
        );

        await waitForLoaderToBeRemoved();
        expect(screen.getByText("Sample Database")).toBeInTheDocument();

        act(() => {
          router?.back();
        });

        await waitFor(() => {
          expect(
            screen.getByRole("link", { name: "Link to Data Model" }),
          ).toBeInTheDocument();
        });
      });
    });
  });

  describe("table section", () => {
    it("should allow to rescan field values", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await userEvent.click(
        screen.getByRole("button", { name: /Sync options/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Re-scan table" }),
      );

      await waitFor(() => {
        const path = `path:/api/table/${ORDERS_TABLE.id}/rescan_values`;
        expect(
          fetchMock.callHistory.called(path, { method: "POST" }),
        ).toBeTruthy();
      });
    });

    it("should allow to discard field values", async () => {
      await setup();

      await userEvent.click(
        await findTablePickerTable(ORDERS_TABLE.display_name),
      );
      await waitForLoaderToBeRemoved();
      await userEvent.click(
        screen.getByRole("button", { name: /Sync options/ }),
      );
      await userEvent.click(
        screen.getByRole("button", {
          name: "Discard cached field values",
        }),
      );

      await waitFor(() => {
        const path = `path:/api/table/${ORDERS_TABLE.id}/discard_values`;
        expect(
          fetchMock.callHistory.called(path, { method: "POST" }),
        ).toBeTruthy();
      });
    });
  });

  describe("field section", () => {
    it("should display json unfolding settings for json fields", async () => {
      await setup({
        databases: [JSON_DB],
        params: {
          databaseId: JSON_DB.id,
          schemaName: JSON_TABLE.schema,
          tableId: JSON_TABLE.id,
          fieldId: JSON_FIELD_ROOT.id,
        },
      });

      expect(screen.getByText("Unfold JSON")).toBeInTheDocument();
    });

    it("should not display json unfolding settings for non-json fields", async () => {
      await setup({
        params: {
          databaseId: SAMPLE_DB.id,
          schemaName: ORDERS_TABLE.schema,
          tableId: ORDERS_TABLE.id,
          fieldId: ORDERS_DISCOUNT_FIELD.id,
        },
      });

      expect(screen.queryByText("Unfold JSON")).not.toBeInTheDocument();
    });

    it("should display type casting settings for supported fields", async () => {
      await setup({
        params: {
          databaseId: SAMPLE_DB.id,
          schemaName: ORDERS_TABLE.schema,
          tableId: ORDERS_TABLE.id,
          fieldId: ORDERS_ID_FIELD.id,
        },
      });

      expect(getFieldCoercionToggle()).toBeInTheDocument();
      await userEvent.click(getFieldCoercionToggle());

      await userEvent.type(getFieldCoercionInput(), "Micro");
      expect(
        screen.getByText("UNIX microseconds → Datetime"),
      ).toBeInTheDocument();
    });

    it("should display type casting settings for float fields", async () => {
      await setup({
        params: {
          databaseId: SAMPLE_DB.id,
          schemaName: ORDERS_TABLE.schema,
          tableId: ORDERS_TABLE.id,
          fieldId: ORDERS_DISCOUNT_FIELD.id,
        },
      });

      expect(getFieldCoercionToggle()).toBeInTheDocument();
      await userEvent.click(getFieldCoercionToggle());

      await userEvent.type(getFieldCoercionInput(), "Float");
      expect(screen.getByText("Float → Integer")).toBeInTheDocument();
    });

    it("should show an access denied error if the foreign key field has an inaccessible target", async () => {
      const productsTable = createProductsTable({
        fields: [
          /* no PRODUCTS_ID_FIELD */
        ],
      });

      const database = createSampleDatabase({
        tables: [ORDERS_TABLE, productsTable],
      });

      await setup({
        databases: [database],
        params: {
          databaseId: database.id,
          schemaName: ORDERS_TABLE.schema,
          tableId: ORDERS_TABLE.id,
          fieldId: ORDERS_PRODUCT_ID_FIELD.id,
        },
        unauthorizedField: PRODUCTS_ID_FIELD,
      });

      const input = getFieldSemanticTypeFkTargetInput();
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("");
      expect(input).toHaveAttribute("placeholder", "Field access denied");
    });

    it("should show custom mapping if has data access", async () => {
      await setup({
        fieldValues: [
          createMockFieldValues({
            field_id: ORDERS_QUANTITY_FIELD.id,
            values: [
              [1, "1 remapped"],
              [2, "2 remapped"],
            ],
          }),
        ],
        params: {
          databaseId: SAMPLE_DB.id,
          schemaName: ORDERS_TABLE.schema,
          tableId: ORDERS_TABLE.id,
          fieldId: ORDERS_QUANTITY_FIELD.id,
        },
      });

      expect(getFieldDisplayValuesInput()).toHaveValue("Custom mapping");

      await userEvent.click(
        screen.getByRole("button", { name: "Edit mapping" }),
      );

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const modal = screen.getByRole("dialog");
      expect(modal).toHaveTextContent("Custom mapping");
      expect(within(modal).getByDisplayValue("1 remapped")).toBeInTheDocument();
      expect(within(modal).getByDisplayValue("2 remapped")).toBeInTheDocument();
    });

    it("should show an access denied error if is custom mapping without data permissions", async () => {
      await setup({
        params: {
          databaseId: SAMPLE_DB.id,
          schemaName: ORDERS_TABLE.schema,
          tableId: ORDERS_TABLE.id,
          fieldId: ORDERS_QUANTITY_FIELD.id,
        },
        hasFieldValuesAccess: false,
        unauthorizedField: ORDERS_QUANTITY_FIELD,
      });
      setupDatabaseIdFieldsEndpoints({
        database: SAMPLE_DB,
      });

      expect(screen.getByText("Custom mapping")).toBeInTheDocument();
      expect(
        await screen.findByText(
          "You need unrestricted data access on this table to map custom display values.",
        ),
      ).toBeInTheDocument();
    });

    it("should allow to rescan field values", async () => {
      await setup({
        params: {
          databaseId: SAMPLE_DB.id,
          schemaName: ORDERS_TABLE.schema,
          tableId: ORDERS_TABLE.id,
          fieldId: ORDERS_ID_FIELD.id,
        },
      });

      await userEvent.click(
        screen.getByRole("button", { name: /Field values/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Re-scan field" }),
      );

      await waitFor(() => {
        const path = `path:/api/field/${ORDERS_ID_FIELD.id}/rescan_values`;
        expect(
          fetchMock.callHistory.called(path, { method: "POST" }),
        ).toBeTruthy();
      });
    });

    it("should allow to discard field values", async () => {
      await setup({
        params: {
          databaseId: SAMPLE_DB.id,
          schemaName: ORDERS_TABLE.schema,
          tableId: ORDERS_TABLE.id,
          fieldId: ORDERS_ID_FIELD.id,
        },
      });

      await userEvent.click(
        screen.getByRole("button", { name: /Field values/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Discard cached field values" }),
      );

      await waitFor(() => {
        const path = `path:/api/field/${ORDERS_ID_FIELD.id}/discard_values`;
        expect(
          fetchMock.callHistory.called(path, { method: "POST" }),
        ).toBeTruthy();
      });
    });
  });
});

const HIDDEN_TABLE_NAMES = [
  "Accounts",
  "Analytic Events",
  "Feedback",
  "Invoices",
] as const;

const VISIBLE_TABLE_NAMES = ["Orders", "People", "Products", "Reviews"];

const ALL_TABLE_NAMES = [...HIDDEN_TABLE_NAMES, ...VISIBLE_TABLE_NAMES];

const FULL_SAMPLE_DB = createSampleDatabase({
  tables: [
    ...HIDDEN_TABLE_NAMES.map((displayName, index) =>
      createMockTable({
        id: 100 + index,
        db_id: SAMPLE_DB.id,
        schema: "PUBLIC",
        name: displayName.toUpperCase().replace(" ", "_"),
        display_name: displayName,
        visibility_type: "hidden",
        fields: [],
      }),
    ),
    createOrdersTable(),
    createPeopleTable(),
    createProductsTable({ field_order: "database" }),
    createReviewsTable(),
  ],
});

const WRITABLE_DB_ID = 2000;

const createWritableNameField = (tableId: number) =>
  createMockField({
    id: tableId * 10,
    table_id: tableId,
    name: "name",
    display_name: "Name",
    base_type: "type/Text",
    effective_type: "type/Text",
  });

const DOMESTIC_ANIMALS_TABLE = createMockTable({
  id: 2001,
  db_id: WRITABLE_DB_ID,
  schema: "Domestic",
  name: "Animals",
  display_name: "Animals",
  fields: [createWritableNameField(2001)],
});

const WILD_ANIMALS_TABLE = createMockTable({
  id: 2002,
  db_id: WRITABLE_DB_ID,
  schema: "Wild",
  name: "Animals",
  display_name: "Animals",
  fields: [createWritableNameField(2002)],
});

const WILD_BIRDS_TABLE = createMockTable({
  id: 2003,
  db_id: WRITABLE_DB_ID,
  schema: "Wild",
  name: "Birds",
  display_name: "Birds",
  fields: [createWritableNameField(2003)],
});

const MULTI_SCHEMA_DB = createMockDatabase({
  id: WRITABLE_DB_ID,
  name: "Writable Postgres12",
  engine: "postgres",
  tables: [DOMESTIC_ANIMALS_TABLE, WILD_ANIMALS_TABLE, WILD_BIRDS_TABLE],
});

const SegmentListStub = () => <span>Segment list</span>;

interface BackendSetupOpts {
  databases?: Database[];
  params?: ParsedRouteParams;
}

/**
 * Renders the data model with a backend that keeps state, so a control shows
 * a change only after the request that makes it.
 */
async function setupWithBackend({
  databases = [FULL_SAMPLE_DB],
  params = DEFAULT_ROUTE_PARAMS,
}: BackendSetupOpts = {}) {
  const backend = setupDataModelBackend({
    tables: databases.flatMap((database) => database.tables ?? []),
    fieldValues: {
      [ORDERS.PRODUCT_ID]: [[1], [2], [3]],
    },
  });
  setupDatabasesEndpoints(databases);
  setupCardDataset();
  setupSearchEndpoints(
    databases.flatMap((database) =>
      (database.tables ?? []).map((table) =>
        createMockSearchResult({
          id: table.id,
          model: "table",
          name: table.display_name,
          table_name: table.name,
          table_schema: table.schema,
          database_id: database.id,
          database_name: database.name,
          initial_sync_status: "complete",
        }),
      ),
    ),
  );

  const view = renderWithProviders(
    <Route path="admin/datamodel">
      <Route index element={redirect("database")} />
      <Route path="database" element={<DataModelV1 />} />
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
      <Route element={<DataModelV1 />}>
        <Route path="segments" element={<SegmentListStub />} />
      </Route>
    </Route>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: Urls.dataModel(params),
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );

  expect(await findTablePickerDatabase(databases[0].name)).toBeInTheDocument();
  await waitForLoaderToBeRemoved();

  return { ...view, backend, router: checkNotNull(view.router) };
}

describe("DataModelV1 (backend that keeps state)", () => {
  beforeEach(() => {
    // rows are short and the list is tall, so the virtual list renders every row
    jest
      .spyOn(window.Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        return createMockDOMRect({
          height: this.getAttribute("data-testid") === "tree-item" ? 30 : 1000,
        });
      });
  });

  afterEach(async () => {
    await flushRequests();
    jest.restoreAllMocks();
  });

  describe("table picker", () => {
    it("should keep the selected table when collapsing and expanding its database (SEM-435) and open a table from the segments page (SEM-484)", async () => {
      const ordersPath = Urls.dataModel({
        databaseId: FULL_SAMPLE_DB.id,
        schemaName: "PUBLIC",
        tableId: ORDERS_ID,
        fieldId: undefined,
      });
      const { router } = await setupWithBackend({
        params: {
          databaseId: FULL_SAMPLE_DB.id,
          schemaName: "PUBLIC",
          tableId: ORDERS_ID,
          fieldId: undefined,
        },
      });
      expect(await findTablePickerTable("Orders")).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await userEvent.click(await findTablePickerDatabase("Sample Database"));
      await waitFor(() => expect(queryTablePickerTables()).toHaveLength(0));
      expect(router.location.pathname).toBe(ordersPath);

      await userEvent.click(await findTablePickerDatabase("Sample Database"));
      expect(await findTablePickerTable("Orders")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(router.location.pathname).toBe(ordersPath);
      expect(getTableNameInput()).toHaveValue("Orders");

      await userEvent.click(screen.getByRole("link", { name: /Segments/ }));
      expect(await screen.findByText("Segment list")).toBeInTheDocument();
      expect(router.location.pathname).toBe("/admin/datamodel/segments");

      await userEvent.click(await findTablePickerTable("Reviews"));
      await waitFor(() =>
        expect(router.location.pathname).toBe(
          Urls.dataModel({
            databaseId: FULL_SAMPLE_DB.id,
            schemaName: "PUBLIC",
            tableId: REVIEWS_ID,
            fieldId: undefined,
          }),
        ),
      );
      await waitFor(() => expect(getTableNameInput()).toHaveValue("Reviews"));
      expect(screen.queryByText("Segment list")).not.toBeInTheDocument();
    });

    it("should search for tables in a single database, open a result, and go back to browsing", async () => {
      const { router } = await setupWithBackend();
      await waitFor(() => expect(queryTablePickerTables()).toHaveLength(8));

      await userEvent.type(getTableSearchInput(), "ts");
      await waitFor(() =>
        expect(getTablePickerItemNames("table")).toEqual([
          "Accounts",
          "Analytic Events",
          "Products",
        ]),
      );
      expect(getTablePickerItemNames("database")).toEqual(["Sample Database"]);
      expect(getTablePickerItemNames("schema")).toEqual(["PUBLIC"]);
      await waitFor(() =>
        expect(getSearchRequestParams()).toContainEqual({
          q: "ts",
          models: "table",
          context: "data-picker",
        }),
      );

      await userEvent.click(await findTablePickerTable("Products"));
      await waitFor(() =>
        expect(router.location.pathname).toBe(
          Urls.dataModel({
            databaseId: FULL_SAMPLE_DB.id,
            schemaName: "PUBLIC",
            tableId: PRODUCTS_ID,
            fieldId: undefined,
          }),
        ),
      );
      await waitFor(() => expect(getTableNameInput()).toHaveValue("Products"));

      await userEvent.clear(getTableSearchInput());
      await userEvent.type(getTableSearchInput(), "xyz");
      expect(
        await within(screen.getByTestId("table-picker")).findByText(
          "No results.",
        ),
      ).toBeInTheDocument();

      await userEvent.clear(getTableSearchInput());
      await waitFor(() =>
        expect(getTablePickerItemNames("table")).toEqual(ALL_TABLE_NAMES),
      );
      expect(getTablePickerItemNames("database")).toEqual(["Sample Database"]);
      expect(getTablePickerItemNames("schema")).toEqual([]);
    });

    it("should search for tables across databases and schemas, and restore the selected table when expanding the tree (SEM-435)", async () => {
      const { router, unmount } = await setupWithBackend({
        databases: [FULL_SAMPLE_DB, MULTI_SCHEMA_DB],
      });

      await userEvent.type(getTableSearchInput(), "rd");
      await waitFor(() =>
        expect(getTablePickerItemNames("table")).toEqual(["Orders", "Birds"]),
      );
      expect(getTablePickerItemNames("database")).toEqual([
        "Sample Database",
        "Writable Postgres12",
      ]);
      expect(getTablePickerItemNames("schema")).toEqual(["PUBLIC", "Wild"]);

      await userEvent.type(getTableSearchInput(), "s");
      await waitFor(() =>
        expect(getTablePickerItemNames("table")).toEqual(["Birds"]),
      );
      expect(getTablePickerItemNames("database")).toEqual([
        "Writable Postgres12",
      ]);
      expect(getTablePickerItemNames("schema")).toEqual(["Wild"]);

      await userEvent.click(await findTablePickerTable("Birds"));
      await waitFor(() =>
        expect(router.location.pathname).toBe(
          `/admin/datamodel/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild/table/${WILD_BIRDS_TABLE.id}`,
        ),
      );
      await waitFor(() => expect(getTableNameInput()).toHaveValue("Birds"));

      await userEvent.clear(getTableSearchInput());
      await waitFor(() =>
        expect(getTablePickerItemNames("table")).toEqual(["Animals", "Birds"]),
      );
      expect(getTablePickerItemNames("database")).toEqual([
        "Sample Database",
        "Writable Postgres12",
      ]);
      expect(getTablePickerItemNames("schema")).toEqual(["Domestic", "Wild"]);

      // start again with a collapsed tree, as the tree state is not persisted
      unmount();
      fetchMock.removeRoutes();
      fetchMock.clearHistory();
      await setupWithBackend({
        databases: [FULL_SAMPLE_DB, MULTI_SCHEMA_DB],
      });
      await waitFor(() =>
        expect(getTablePickerItemNames("database")).toEqual([
          "Sample Database",
          "Writable Postgres12",
        ]),
      );
      expect(getTablePickerItemNames("table")).toEqual([]);

      await userEvent.click(
        await findTablePickerDatabase("Writable Postgres12"),
      );
      await userEvent.click(await findTablePickerSchema("Domestic"));
      await userEvent.click(await findTablePickerTable("Animals"));
      await waitFor(() => expect(getTableNameInput()).toHaveValue("Animals"));
      await userEvent.click(await findTablePickerSchema("Wild"));
      await userEvent.click(await findTablePickerTable("Birds"));
      await waitFor(() => expect(getTableNameInput()).toHaveValue("Birds"));

      await userEvent.click(
        await findTablePickerDatabase("Writable Postgres12"),
      );
      await waitFor(() =>
        expect(getTablePickerItemNames("schema")).toEqual([]),
      );
      await userEvent.click(
        await findTablePickerDatabase("Writable Postgres12"),
      );

      expect(await findTablePickerTable("Birds")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(getTableNameInput()).toHaveValue("Birds");
    });
  });

  describe("table visibility", () => {
    it("should hide all tables of a single-schema database, undo it, and unhide them all", async () => {
      const visibleTableIds = [ORDERS_ID, PEOPLE_ID, PRODUCTS_ID, REVIEWS_ID];
      const allTableIds = [100, 101, 102, 103, ...visibleTableIds];
      await setupWithBackend({
        params: {
          databaseId: FULL_SAMPLE_DB.id,
          schemaName: "PUBLIC",
          tableId: ORDERS_ID,
          fieldId: undefined,
        },
      });
      await verifyTablesHidden([...HIDDEN_TABLE_NAMES]);
      await verifyTablesVisible(VISIBLE_TABLE_NAMES);

      await userEvent.click(
        await getBulkVisibilityButton("database", "Sample Database", "Hide"),
      );
      await verifyTablesHidden(ALL_TABLE_NAMES);
      expect(getRequestBodies("stateful-tables-put")).toEqual([
        { ids: visibleTableIds, visibility_type: "hidden" },
      ]);

      await undo("Tables hidden");
      expect(getRequestBodies("stateful-tables-put")).toEqual([
        { ids: visibleTableIds, visibility_type: "hidden" },
        { ids: visibleTableIds, visibility_type: null },
      ]);
      await verifyTablesHidden([...HIDDEN_TABLE_NAMES]);
      await verifyTablesVisible(VISIBLE_TABLE_NAMES);

      await userEvent.click(
        await getBulkVisibilityButton("database", "Sample Database", "Hide"),
      );
      await findToast("Tables hidden");
      await dismissToasts();
      await verifyTablesHidden(ALL_TABLE_NAMES);

      await userEvent.click(
        await getBulkVisibilityButton("database", "Sample Database", "Unhide"),
      );
      await findToast("Tables unhidden");
      await dismissToasts();
      expect(getLastRequestBody("stateful-tables-put")).toEqual({
        ids: allTableIds,
        visibility_type: null,
      });
      await verifyTablesVisible(ALL_TABLE_NAMES);
    });

    it("should hide all tables of an expanded schema only, in a multi-schema database", async () => {
      await setupWithBackend({ databases: [MULTI_SCHEMA_DB] });
      const database = await findTablePickerDatabase("Writable Postgres12");

      expect(await findTablePickerSchema("Domestic")).toBeInTheDocument();
      expect(queryBulkHideButton(database)).not.toBeInTheDocument();
      expect(
        queryBulkHideButton(await findTablePickerSchema("Domestic")),
      ).not.toBeInTheDocument();
      expect(
        queryBulkHideButton(await findTablePickerSchema("Wild")),
      ).not.toBeInTheDocument();

      await userEvent.click(await findTablePickerSchema("Wild"));
      await verifyTablesVisible(["Animals", "Birds"]);
      expect(
        queryBulkHideButton(
          await findTablePickerDatabase("Writable Postgres12"),
        ),
      ).not.toBeInTheDocument();
      expect(
        queryBulkHideButton(await findTablePickerSchema("Domestic")),
      ).not.toBeInTheDocument();

      await userEvent.click(
        await getBulkVisibilityButton("schema", "Wild", "Hide"),
      );
      await verifyTablesHidden(["Animals", "Birds"]);
      expect(getRequestBodies("stateful-tables-put")).toEqual([
        {
          ids: [WILD_ANIMALS_TABLE.id, WILD_BIRDS_TABLE.id],
          visibility_type: "hidden",
        },
      ]);

      await undo("Tables hidden");
      expect(getLastRequestBody("stateful-tables-put")).toEqual({
        ids: [WILD_ANIMALS_TABLE.id, WILD_BIRDS_TABLE.id],
        visibility_type: null,
      });
      await verifyTablesVisible(["Animals", "Birds"]);
    });

    it("should update the table picker when changing the visibility of a branch other than the selected one", async () => {
      await setupWithBackend({
        databases: [MULTI_SCHEMA_DB, FULL_SAMPLE_DB],
      });

      await userEvent.click(await findTablePickerDatabase("Sample Database"));
      await userEvent.click(
        await findTablePickerDatabase("Writable Postgres12"),
      );
      await userEvent.click(await findTablePickerSchema("Wild"));
      await userEvent.click(await findTablePickerTable("Birds"));
      await waitFor(() => expect(getTableNameInput()).toHaveValue("Birds"));

      await userEvent.click(
        within(await findTablePickerTable("Accounts")).getByRole("button", {
          name: "Unhide table",
        }),
      );
      await verifyTablesVisible(["Accounts"]);
      expect(getRequestBodies("stateful-table-100-put")).toEqual([
        { visibility_type: null },
      ]);

      await userEvent.click(
        await getBulkVisibilityButton("database", "Sample Database", "Hide"),
      );
      await verifyTablesHidden(ALL_TABLE_NAMES);
      expect(getRequestBodies("stateful-tables-put")).toEqual([
        {
          ids: [100, ORDERS_ID, PEOPLE_ID, PRODUCTS_ID, REVIEWS_ID],
          visibility_type: "hidden",
        },
      ]);
      expect(getTableNameInput()).toHaveValue("Birds");
    });
  });

  describe("table section", () => {
    it("should sort fields alphabetically and smartly", async () => {
      const { backend } = await setupWithBackend({
        params: {
          databaseId: FULL_SAMPLE_DB.id,
          schemaName: "PUBLIC",
          tableId: PRODUCTS_ID,
          fieldId: undefined,
        },
      });

      await userEvent.click(screen.getByRole("button", { name: /Sorting/ }));
      expect(
        within(getSortOrderInput()).getByDisplayValue("database"),
      ).toBeChecked();

      await userEvent.click(
        within(getSortOrderInput()).getByLabelText("Alphabetical order"),
      );
      await findToast("Field order updated");
      await dismissToasts();
      expect(getRequestBodies(`stateful-table-${PRODUCTS_ID}-put`)).toEqual([
        { field_order: "alphabetical" },
      ]);
      await waitFor(() =>
        expect(
          within(getSortOrderInput()).getByDisplayValue("alphabetical"),
        ).toBeChecked(),
      );

      await userEvent.click(
        within(getSortOrderInput()).getByLabelText("Auto order"),
      );
      await findToast("Field order updated");
      await dismissToasts();
      expect(getRequestBodies(`stateful-table-${PRODUCTS_ID}-put`)).toEqual([
        { field_order: "alphabetical" },
        { field_order: "smart" },
      ]);
      await waitFor(() =>
        expect(
          within(getSortOrderInput()).getByDisplayValue("smart"),
        ).toBeChecked(),
      );
      expect(backend.getTable(PRODUCTS_ID).field_order).toBe("smart");
    });
  });

  describe("preview section", () => {
    const ORDERS_PRODUCT_ID_PARAMS: ParsedRouteParams = {
      databaseId: SAMPLE_DB_ID,
      schemaName: "PUBLIC",
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    };

    it("should not close the preview on Esc while a modal is open, and close it on Esc otherwise", async () => {
      await setupWithBackend({ params: ORDERS_PRODUCT_ID_PARAMS });
      expect(screen.queryByTestId("preview-section")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Preview" }));
      expect(screen.getByTestId("preview-section")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Sync options" }),
      );
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId("preview-section")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Field values" }),
      );
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId("preview-section")).toBeInTheDocument();

      // focus returns to the "Field values" button, so Esc is not typed into an input
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByTestId("preview-section")).not.toBeInTheDocument();
    });

    it("should not close the preview on Esc while a popover is open", async () => {
      await setupWithBackend({ params: ORDERS_PRODUCT_ID_PARAMS });
      await userEvent.click(screen.getByRole("button", { name: "Preview" }));
      expect(screen.getByTestId("preview-section")).toBeInTheDocument();

      await userEvent.click(getFieldSemanticTypeInput());
      expect(await findShownListbox()).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId("preview-section")).toBeInTheDocument();
    });

    it("should not auto-focus the inputs of the filtering preview", async () => {
      await setupWithBackend({ params: ORDERS_PRODUCT_ID_PARAMS });

      await userEvent.click(screen.getByRole("button", { name: "Preview" }));
      await userEvent.click(
        within(screen.getByTestId("preview-section")).getByText("Filtering"),
      );
      const idInput = await within(
        screen.getByTestId("preview-section"),
      ).findByPlaceholderText("Enter an ID");
      expect(idInput).not.toHaveFocus();

      await selectOption(getFieldFilteringInput(), "A list of all values");
      expect(
        getLastRequestBody(`stateful-field-${ORDERS.PRODUCT_ID}-put`),
      ).toEqual({ has_field_values: "list" });
      const listInput = await within(
        screen.getByTestId("preview-section"),
      ).findByPlaceholderText("Search the list");
      expect(listInput).not.toHaveFocus();

      await clickTableSectionField("Tax");
      const minInput = await within(
        screen.getByTestId("preview-section"),
      ).findByPlaceholderText("Min");
      expect(minInput).not.toHaveFocus();

      await selectOption(getFieldFilteringInput(), "Search box");
      expect(getLastRequestBody(`stateful-field-${ORDERS.TAX}-put`)).toEqual({
        has_field_values: "search",
      });
      const numberInput = await within(
        screen.getByTestId("preview-section"),
      ).findByPlaceholderText("Enter a number");
      expect(numberInput).not.toHaveFocus();
    });

    it("should show the filtering preview of a field of a hidden table", async () => {
      await setupWithBackend({ params: ORDERS_PRODUCT_ID_PARAMS });

      await userEvent.click(
        within(await findTablePickerTable("Orders")).getByRole("button", {
          name: "Hide table",
        }),
      );
      await findToast("Hid Orders");
      expect(getRequestBodies(`stateful-table-${ORDERS_ID}-put`)).toEqual([
        { visibility_type: "hidden" },
      ]);
      await waitFor(async () =>
        expect(
          within(await findTablePickerTable("Orders")).getByRole("button", {
            name: "Unhide table",
          }),
        ).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByRole("button", { name: "Preview" }));
      await userEvent.click(
        within(screen.getByTestId("preview-section")).getByText("Filtering"),
      );
      expect(
        await within(
          screen.getByTestId("preview-section"),
        ).findByPlaceholderText("Enter an ID"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Something’s gone wrong"),
      ).not.toBeInTheDocument();
    });
  });

  it("should open the field properties when another table of the database is hidden (metabase#18384)", async () => {
    const database = createSampleDatabase({
      tables: [
        createOrdersTable(),
        createPeopleTable(),
        createProductsTable(),
        createReviewsTable({ visibility_type: "hidden" }),
      ],
    });
    const { router } = await setupWithBackend({
      databases: [database],
      params: {
        databaseId: database.id,
        schemaName: "PUBLIC",
        tableId: PEOPLE_ID,
        fieldId: undefined,
      },
    });
    expect(
      within(await findTablePickerTable("Reviews")).getByRole("button", {
        name: "Unhide table",
      }),
    ).toBeInTheDocument();

    await clickTableSectionField("Address");

    await waitFor(() =>
      expect(router.location.pathname).toBe(
        `/admin/datamodel/database/${database.id}/schema/${database.id}:PUBLIC/table/${PEOPLE_ID}/field/${PEOPLE.ADDRESS}`,
      ),
    );
    expect(await screen.findByTestId("field-section")).toBeInTheDocument();
    expect(getFieldNameInput()).toHaveValue("Address");
  });
});

function getSearchRequestParams() {
  return fetchMock.callHistory
    .calls("search")
    .map((call) => Object.fromEntries(new URL(call.url).searchParams));
}

function queryTablePickerTables() {
  return screen
    .queryAllByTestId("tree-item")
    .filter((item) => item.getAttribute("data-type") === "table");
}

function getTablePickerItemNames(type: "database" | "schema" | "table") {
  return screen
    .queryAllByTestId("tree-item")
    .filter((item) => item.getAttribute("data-type") === type)
    .map((item) => item.textContent);
}

function queryBulkHideButton(item: HTMLElement) {
  return within(item).queryByRole("button", { name: "Hide all tables" });
}

async function getBulkVisibilityButton(
  type: "database" | "schema",
  name: string,
  action: "Hide" | "Unhide",
) {
  return await waitFor(async () =>
    within(
      type === "database"
        ? await findTablePickerDatabase(name)
        : await findTablePickerSchema(name),
    ).getByRole("button", { name: `${action} all tables` }),
  );
}

async function verifyTablesVisible(names: string[]) {
  for (const name of names) {
    await waitFor(async () =>
      expect(
        within(await findTablePickerTable(name)).getByRole("button", {
          name: "Hide table",
        }),
      ).toBeInTheDocument(),
    );
  }
}

async function verifyTablesHidden(names: string[]) {
  for (const name of names) {
    await waitFor(async () =>
      expect(
        within(await findTablePickerTable(name)).getByRole("button", {
          name: "Unhide table",
        }),
      ).toBeInTheDocument(),
    );
  }
}

function getSortOrderInput() {
  return within(getTableSection()).getByRole("radiogroup", {
    name: "Column order",
  });
}

function getFieldFilteringInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select field filtering",
  );
}

function getTableSearchInput() {
  return screen.getByPlaceholderText("Search tables");
}

function getTableNameInput() {
  return screen.getByPlaceholderText("Give this table a name");
}

/** table picker helpers */

async function findTablePickerDatabase(name: string) {
  return await findTablePickerItem("database", name);
}

async function findTablePickerSchema(name: string) {
  return await findTablePickerItem("schema", name);
}

async function findTablePickerTable(name: string) {
  return await findTablePickerItem("table", name);
}

async function findTablePickerItem(
  type: "table" | "schema" | "database",
  name: string,
) {
  let items: HTMLElement[] = [];

  await waitFor(() => {
    const allItems = screen.queryAllByTestId("tree-item");
    items = allItems.filter(
      (el) =>
        el.getAttribute("data-type") === type && el.textContent?.includes(name),
    );

    if (items.length !== 1) {
      throw new Error(`Cannot find ${type} in table picker`); // trigger retry
    }
  });

  return items[0];
}

async function getHideTableButton(name: string) {
  return within(await findTablePickerTable(name)).getByRole("button", {
    name: "Hide table",
  });
}

async function getUnhideTableButton(name: string) {
  return within(await findTablePickerTable(name)).getByRole("button", {
    name: "Unhide table",
  });
}

/** table section helpers */

function getTableSection() {
  return screen.getByTestId("table-section");
}

function getTableSectionField(name: string) {
  return within(getTableSection()).getByLabelText(name);
}

function getTableSectionFieldNameInput(name: string) {
  return within(getTableSectionField(name)).getByPlaceholderText(
    "Give this field a name",
  );
}

async function clickTableSectionField(name: string) {
  await userEvent.click(within(getTableSectionField(name)).getByRole("img"));
}

/** field section helpers */

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

function getFieldDisplayValuesInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select display values",
  );
}
