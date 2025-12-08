import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { IndexRedirect, Link, Route } from "react-router";

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
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import registerVisualizations from "metabase/visualizations/register";
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
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_FIELD_VALUES,
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
  remappings: [
    [1, "1 remapped"],
    [2, "2 remapped"],
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
  parent_id: getRawTableFieldId(JSON_FIELD_ROOT),
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
  setupDatabasesEndpoints(databases, { hasSavedQuestions: false });
  setupCardDataset();

  if (!shouldSkipTableMocks) {
    setupTableEndpoints(createPeopleTable());
  }

  if (hasFieldValuesAccess) {
    setupFieldsValuesEndpoints(fieldValues);
  }

  if (unauthorizedField) {
    setupUnauthorizedFieldEndpoint(unauthorizedField);
    setupUnauthorizedFieldValuesEndpoints(
      getRawTableFieldId(unauthorizedField),
    );
  }

  const { history } = renderWithProviders(
    <>
      <Route path="notAdmin" component={OtherComponent} />
      <Route path="admin/datamodel">
        <IndexRedirect to="database" />
        <Route path="database" component={DataModelV1} />
        <Route path="database/:databaseId" component={DataModelV1} />
        <Route
          path="database/:databaseId/schema/:schemaId"
          component={DataModelV1}
        />
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId"
          component={DataModelV1}
        />
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
          component={DataModelV1}
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

  return { history };
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
      setup({ databases: [SAMPLE_DB_NO_SCHEMA] });

      await waitFor(async () => {
        expect(
          await findTablePickerDatabase(SAMPLE_DB_NO_SCHEMA.name),
        ).toBeInTheDocument();
      });

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
        const { history } = await setup({
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

        history?.goBack();

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

      const calls = fetchMock.callHistory.calls(
        `path:/api/table/${ORDERS_TABLE.id}/rescan_values`,
        {
          method: "POST",
        },
      );

      await waitFor(() => {
        expect(calls.length).toBeGreaterThan(0);
      });

      const lastCall = calls[calls.length - 1];
      expect(JSON.parse(lastCall.options.body as string)).toEqual({});
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

      const calls = fetchMock.callHistory.calls(
        `path:/api/table/${ORDERS_TABLE.id}/discard_values`,
        {
          method: "POST",
        },
      );

      await waitFor(() => {
        expect(calls.length).toBeGreaterThan(0);
      });

      const lastCall = calls[calls.length - 1];
      expect(JSON.parse(lastCall.options.body as string)).toEqual({});
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
          fieldId: getRawTableFieldId(JSON_FIELD_ROOT),
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
          fieldId: getRawTableFieldId(ORDERS_DISCOUNT_FIELD),
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
          fieldId: getRawTableFieldId(ORDERS_ID_FIELD),
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
          fieldId: getRawTableFieldId(ORDERS_DISCOUNT_FIELD),
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
          fieldId: getRawTableFieldId(ORDERS_PRODUCT_ID_FIELD),
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
            field_id: getRawTableFieldId(ORDERS_QUANTITY_FIELD),
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
          fieldId: getRawTableFieldId(ORDERS_QUANTITY_FIELD),
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
          fieldId: getRawTableFieldId(ORDERS_QUANTITY_FIELD),
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
          fieldId: getRawTableFieldId(ORDERS_ID_FIELD),
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
          fieldId: getRawTableFieldId(ORDERS_ID_FIELD),
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
