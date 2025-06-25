import userEvent from "@testing-library/user-event";
import { IndexRedirect, Route } from "react-router";

import {
  setupCardDataset,
  setupDatabasesEndpoints,
  setupFieldEndpoints,
  setupFieldsValuesEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
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
import registerVisualizations from "metabase/visualizations/register";
import type { Database } from "metabase-types/api";
import { createMockSearchResult } from "metabase-types/api/mocks";
import {
  SAMPLE_DB_FIELD_VALUES,
  createOrdersDiscountField,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersTable,
  createOrdersUserIdField,
  createPeopleIdField,
  createPeopleTable,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DataModel } from "./DataModel";
import type { ParsedRouteParams } from "./types";
import { getUrl } from "./utils";

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

const ORDERS_TABLE = createOrdersTable({
  fields: [
    ORDERS_ID_FIELD,
    ORDERS_PRODUCT_ID_FIELD,
    ORDERS_USER_ID_FIELD,
    ORDERS_DISCOUNT_FIELD,
  ],
  visibility_type: "technical",
});

const PRODUCTS_TABLE = createProductsTable();

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE, PRODUCTS_TABLE],
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

interface SetupOpts {
  databases?: Database[];
  params?: ParsedRouteParams;
}

async function setup({
  databases = [SAMPLE_DB],
  params = DEFAULT_ROUTE_PARAMS,
}: SetupOpts = {}) {
  setupDatabasesEndpoints(databases, { hasSavedQuestions: false });
  setupCardDataset();
  setupFieldsValuesEndpoints(SAMPLE_DB_FIELD_VALUES);

  renderWithProviders(
    <Route path="admin/datamodel">
      <IndexRedirect to="database" />
      <Route path="database" component={DataModel} />
      <Route path="database/:databaseId" component={DataModel} />
      <Route
        path="database/:databaseId/schema/:schemaId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
        component={DataModel}
      />
    </Route>,
    {
      withRouter: true,
      initialRoute: getUrl(params),
    },
  );

  await waitFor(() => {
    expect(getTablePickerDatabase(databases[0].name)).toBeInTheDocument();
  });
}

describe("DataModel", () => {
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

      await waitFor(() => {
        expect(
          getTablePickerDatabase(SAMPLE_DB_NO_SCHEMA.name),
        ).toBeInTheDocument();
      });

      expect(
        getTablePickerTable(ORDERS_TABLE_NO_SCHEMA.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("single schema database", () => {
    it("should select the first database and the only schema by default", async () => {
      await setup();

      expect(
        getTablePickerTable(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
      expect(screen.queryByText(ORDERS_TABLE.schema)).not.toBeInTheDocument();
    });

    it("should allow to search for a table", async () => {
      await setup();
      setupSearchEndpoints(
        [
          createMockSearchResult({
            id: getNextId(),
            model: "table",
            name: ORDERS_TABLE.display_name,
            table_name: ORDERS_TABLE.display_name,
            table_schema: "public",
            database_name: SAMPLE_DB.name,
          }),
        ],
        { overwriteRoutes: true },
      );

      const searchValue = ORDERS_TABLE.name.substring(0, 3);
      await userEvent.type(getTableSearchInput(), searchValue);

      expect(
        getTablePickerTable(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(PRODUCTS_TABLE.display_name),
      ).not.toBeInTheDocument();
    });

    it("should not allow to enter an empty table name", async () => {
      await setup();

      await userEvent.click(getTablePickerTable(ORDERS_TABLE.display_name));
      await waitForLoaderToBeRemoved();
      await userEvent.clear(getTableNameInput());
      await userEvent.tab();

      expect(getTableNameInput()).toHaveValue(ORDERS_TABLE.display_name);
    });

    it("should not allow to enter an empty field name in table section", async () => {
      await setup();

      await userEvent.click(getTablePickerTable(ORDERS_TABLE.display_name));
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

      await userEvent.click(getTablePickerTable(ORDERS_TABLE.display_name));
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

      await userEvent.click(getTablePickerTable(PRODUCTS_TABLE.display_name));
      await waitForLoaderToBeRemoved();

      expect(
        getHideTableButton(PRODUCTS_TABLE.display_name),
      ).toBeInTheDocument();
    });

    it("should display hidden tables", async () => {
      await setup();

      await userEvent.click(getTablePickerTable(ORDERS_TABLE.display_name));
      await waitForLoaderToBeRemoved();

      expect(
        getUnhideTableButton(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
    });

    it("clicking on tables with initial_sync_status='incomplete' should not navigate to the table", async () => {
      await setup({ databases: [SAMPLE_DB_WITH_INITIAL_SYNC_INCOMPLETE] });

      expect(
        screen.getByText("Start by selecting data to model"),
      ).toBeInTheDocument();

      expect(
        within(
          getTablePickerTable(
            ORDERS_TABLE_INITIAL_SYNC_INCOMPLETE.display_name,
          ),
        ).queryByRole("button", {
          name: "Hide table",
        }),
      ).not.toBeInTheDocument();

      // This click should not cause a change, as the table should be disabled
      await expect(
        userEvent.click(
          getTablePickerTable(
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

      await userEvent.click(getTablePickerTable(ORDERS_TABLE.display_name));
      await waitForLoaderToBeRemoved();
      await userEvent.click(screen.getByRole("button", { name: /Sorting/ }));

      expect(screen.getByLabelText("Database order")).toBeInTheDocument();
      expect(screen.getByLabelText("Alphabetical order")).toBeInTheDocument();
      expect(screen.getByLabelText("Custom order")).toBeInTheDocument();
      expect(screen.getByLabelText("Auto order")).toBeInTheDocument();
    });

    it("should display field visibility options", async () => {
      await setup();

      await userEvent.click(getTablePickerTable(ORDERS_TABLE.display_name));
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

      await userEvent.click(getTablePickerTable(ORDERS_TABLE.display_name));
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

      await userEvent.click(getTablePickerTable(ORDERS_TABLE.display_name));
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
      setupTableEndpoints(createPeopleTable());

      await userEvent.click(getTablePickerTable(ORDERS_TABLE.display_name));
      await waitForLoaderToBeRemoved();
      await clickTableSectionField(ORDERS_USER_ID_FIELD.display_name);

      const input = getFieldSemanticTypeFkTargetInput();
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("");
      expect(input).toHaveAttribute("placeholder", "Field access denied");
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

function getTablePickerDatabase(name: string) {
  const items = screen
    .getAllByTestId("tree-item")
    .filter(
      (element) =>
        element.getAttribute("data-type") === "database" &&
        element.textContent?.includes(name),
    );

  if (items.length !== 1) {
    throw new Error("Cannot find database in table picker");
  }

  return items[0];
}

function getTablePickerSchema(name: string) {
  return screen
    .getAllByTestId("tree-item")
    .filter('[data-type="schema"]')
    .filter(`:contains("${name}")`);
}

function getTablePickerTable(name: string) {
  const items = screen
    .getAllByTestId("tree-item")
    .filter(
      (element) =>
        element.getAttribute("data-type") === "table" &&
        element.textContent?.includes(name),
    );

  if (items.length !== 1) {
    throw new Error("Cannot find table in table picker");
  }

  return items[0];
}

function getTablePickerTables() {
  return screen.getAllByTestId("tree-item").filter('[data-type="table"]');
}

function getHideTableButton(name: string) {
  return within(getTablePickerTable(name)).getByRole("button", {
    name: "Hide table",
  });
}

function getUnhideTableButton(name: string) {
  return within(getTablePickerTable(name)).getByRole("button", {
    name: "Unhide table",
  });
}

/** table section helpers */

function getTableSection() {
  return screen.getByTestId("table-section");
}

function getTableDescriptionInput() {
  return getTableSection().getByPlaceholderText(
    "Give this table a description",
  );
}

function getTableSortButton() {
  return getTableSection().button(/Sorting/);
}

function getTableSortOrderInput() {
  return getTableSection().getByLabelText("Column order");
}

function getTableSectionField(name: string) {
  return within(getTableSection()).getByLabelText(name);
}

function getTableSectionSortableField(name: string) {
  return getTableSection().getByLabelText(name);
}

function getTableSectionSortableFields() {
  return getTableSection().getAllByRole("listitem");
}

function getTableSectionFieldNameInput(name: string) {
  return within(getTableSectionField(name)).getByPlaceholderText(
    "Give this field a name",
  );
}

function getTableSectionFieldDescriptionInput(name: string) {
  return getTableSectionField(name).getByPlaceholderText("No description yet");
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

function getFieldDescriptionInput() {
  return getFieldSection().getByPlaceholderText(
    "Give this field a description",
  );
}

function getFieldDataTypeInput() {
  return getFieldSection().getByLabelText("Data type");
}

function getFieldCoercionToggle() {
  return getFieldSection().getByLabelText("Cast to a specific data type");
}

function getFieldCoercionInput() {
  return getFieldSection().getByPlaceholderText("Select data type");
}

function getFieldSemanticTypeInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select a semantic type",
  );
}

function getFieldSemanticTypeCurrenscreenInput() {
  return getFieldSection().getByPlaceholderText("Select a currenscreen type");
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
  return getFieldSection().getByPlaceholderText("Select field filtering");
}

function getFieldDisplayValuesInput() {
  return getFieldSection().getByPlaceholderText("Select display values");
}

function getFieldDisplayValuesFkTargetInput() {
  return getFieldSection().getByPlaceholderText("Choose a field");
}

function getFieldStyleInput() {
  return getFieldSection().getByLabelText("Style");
}

function getFieldPrefixInput() {
  return getFieldSection().getByTestId("prefix");
}

function getFieldSuffixInput() {
  return getFieldSection().getByTestId("suffix");
}
