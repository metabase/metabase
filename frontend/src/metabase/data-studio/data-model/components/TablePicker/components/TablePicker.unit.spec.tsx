import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupTableSearchEndpoint,
  setupUserKeyValueEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { SelectionProvider } from "metabase/data-studio/data-model/pages/DataModel/contexts/SelectionContext";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { Database, Table, TokenFeatures, User } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSchema,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import type { TreePath } from "../types";
import { UncontrolledTablePicker } from "../wrappers";

let id = 1000;
function nextId() {
  return id++;
}

beforeEach(() => {
  mockGetBoundingClientRect({ height: 40, width: 800 });
});

afterEach(() => {
  jest.restoreAllMocks();
  reinitialize();
});

const PUBLIC_SCHEMA = createMockSchema({
  id: "PUBLIC",
  name: "PUBLIC",
});

const PRIVATE_SCHEMA = createMockSchema({
  id: "PRIVATE",
  name: "PRIVATE",
});

const FOO_TABLE = createMockTable({
  id: nextId(),
  name: "FOO",
  display_name: "Foo",
  schema: PRIVATE_SCHEMA.id,
  fields: [],
});

const BAR_TABLE = createMockTable({
  id: nextId(),
  name: "BAR",
  display_name: "Bar",
  schema: PUBLIC_SCHEMA.id,
  fields: [],
});

const DATABASE_WITH_MULTIPLE_SCHEMAS = createMockDatabase({
  id: nextId(),
  name: "DATABASE_WITH_MULTIPLE_SCHEMAS",
  tables: [FOO_TABLE, BAR_TABLE],
});

const SINGLE_SCHEMA = createMockSchema({
  id: "single_schema",
  name: "SINGLE_SCHEMA",
});

const QUU = createMockTable({
  id: nextId(),
  name: "QUU",
  display_name: "Quu",
  schema: SINGLE_SCHEMA.name,
});

const QUX = createMockTable({
  id: nextId(),
  name: "QUX",
  display_name: "Qux",
  schema: SINGLE_SCHEMA.name,
});

const DATABASE_WITH_SINGLE_SCHEMA = createMockDatabase({
  id: nextId(),
  name: "DATABASE_SINGLE_SCHEMA",
  tables: [QUU, QUX],
});

const UNNAMED_SCHEMA = createMockSchema({
  id: "unnamed_schema",
  name: "",
});

const NAMED_SCHEMA = createMockSchema({
  id: "named",
  name: "NAMED_SCHEMA",
});

const CORGE = createMockTable({
  id: nextId(),
  schema: UNNAMED_SCHEMA.name,
  name: "CORGE",
  display_name: "Corge",
});

const GRAULT = createMockTable({
  id: nextId(),
  schema: UNNAMED_SCHEMA.name,
  name: "GRAULT",
  display_name: "Grault",
});

const GLORP = createMockTable({
  id: nextId(),
  schema: NAMED_SCHEMA.name,
  name: "GLORP",
  display_name: "Glorp",
});

const DATABASE_WITH_UNNAMED_SCHEMA = createMockDatabase({
  id: nextId(),
  name: "DATABASE_WITH_UNNAMED_SCHEMA",
  tables: [CORGE, GRAULT, GLORP],
});

const BIRDS_TABLE = createMockTable({
  id: nextId(),
  name: "BIRDS",
  display_name: "Birds",
  schema: PUBLIC_SCHEMA.name,
});

const ORDER_ITEM_DISCOUNT_TABLE = createMockTable({
  id: nextId(),
  name: "ORDER_ITEM_DISCOUNT",
  display_name: "Order Item Discount",
  schema: PUBLIC_SCHEMA.name,
});

const LITERAL_SEARCH_TABLE = createMockTable({
  id: nextId(),
  name: "what-a_cool%table\\name",
  display_name: "Literal Search Table",
  schema: PUBLIC_SCHEMA.name,
});

const SEARCH_SEMANTICS_DATABASE = createMockDatabase({
  id: nextId(),
  name: "SEARCH_SEMANTICS_DATABASE",
  tables: [
    FOO_TABLE,
    BIRDS_TABLE,
    ORDER_ITEM_DISCOUNT_TABLE,
    LITERAL_SEARCH_TABLE,
  ],
});

const MOCK_DATABASES = [
  DATABASE_WITH_MULTIPLE_SCHEMAS,
  DATABASE_WITH_SINGLE_SCHEMA,
  DATABASE_WITH_UNNAMED_SCHEMA,
];

const currentUser: User = createMockUser({
  id: 2,
  common_name: "Bar",
  is_superuser: true,
});

interface FilterRequestCase {
  name: string;
  selectFilter: () => Promise<void>;
  expectedParams: Record<string, string>;
  tokenFeatures?: Partial<TokenFeatures>;
}

const FILTER_REQUEST_CASES: FilterRequestCase[] = [
  {
    name: "data-layer",
    selectFilter: () => selectFilterOption("Visibility layer", "Final"),
    expectedParams: { "data-layer": "final" },
  },
  {
    name: "data-source",
    selectFilter: () => selectFilterOption("Source", "Uploaded data"),
    expectedParams: { "data-source": "upload" },
  },
  {
    name: "owner-user-id",
    selectFilter: () => selectFilterOption("Owner", currentUser.common_name),
    expectedParams: { "owner-user-id": String(currentUser.id) },
  },
  {
    name: "owner-email",
    selectFilter: selectOwnerEmail,
    expectedParams: { "owner-email": "owner@example.com" },
  },
  {
    name: "orphan-only",
    selectFilter: () => selectFilterOption("Owner", "Unspecified"),
    expectedParams: { "orphan-only": "true" },
  },
  {
    name: "unused-only",
    selectFilter: () =>
      userEvent.click(
        screen.getByLabelText("Table isn’t referenced by anything"),
      ),
    expectedParams: { "unused-only": "true" },
  },
  {
    name: "published-only",
    selectFilter: () =>
      userEvent.click(screen.getByLabelText("Published tables only")),
    expectedParams: { "published-only": "true" },
    tokenFeatures: { library: true },
  },
];

function setup({
  path = {},
  databases = MOCK_DATABASES,
  tokenFeatures = {},
}: {
  path?: TreePath;
  databases?: Database[];
  tokenFeatures?: Partial<TokenFeatures>;
} = {}) {
  setupDatabasesEndpoints(databases);
  setupTableSearchEndpoint(
    databases.flatMap(
      (db) => db.tables?.map((t) => ({ ...t, db_id: db.id })) ?? [],
    ),
  );
  setupUsersEndpoints([currentUser]);
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "seen-publish-tables-info",
    value: false,
  });

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (tokenFeatures.library) {
    setupEnterpriseOnlyPlugin("library");
  }

  const onChange = jest.fn();
  const setOnUpdateCallback = jest.fn();
  const params = {};

  renderWithProviders(
    <Route
      path="*"
      element={
        <SelectionProvider>
          <UncontrolledTablePicker
            initialValue={path}
            onChange={onChange}
            params={params}
            setOnUpdateCallback={setOnUpdateCallback}
          />
        </SelectionProvider>
      }
    />,
    { withRouter: true, storeInitialState: state },
  );
  return { onChange };
}

describe("TablePicker", () => {
  describe("Tree view", () => {
    it("renders databases and unfurls nested items", async () => {
      const { onChange } = setup({ path: {} });

      await waitLoading();

      expect(item(DATABASE_WITH_MULTIPLE_SCHEMAS)).toBeInTheDocument();
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toBeInTheDocument();

      await clickItem(DATABASE_WITH_MULTIPLE_SCHEMAS);
      await waitLoading();

      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
      });

      expect(item(PRIVATE_SCHEMA)).toBeInTheDocument();
      expect(item(PUBLIC_SCHEMA)).toBeInTheDocument();
      expect(item(PUBLIC_SCHEMA)).toBeInTheDocument();

      await clickItem(PUBLIC_SCHEMA);
      await waitLoading();

      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
        schemaName: PUBLIC_SCHEMA.name,
      });

      expect(item(FOO_TABLE)).not.toBeInTheDocument();
      expect(item(BAR_TABLE)).toBeInTheDocument();

      await clickItem(BAR_TABLE);

      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
        schemaName: PUBLIC_SCHEMA.name,
        tableId: BAR_TABLE.id,
      });

      // first select, then collapse
      await clickItem(PUBLIC_SCHEMA);
      await waitLoading();
      await clickItem(PUBLIC_SCHEMA);
      await waitLoading();

      expect(item(FOO_TABLE)).not.toBeInTheDocument();
      expect(item(BAR_TABLE)).not.toBeInTheDocument();

      // first select, then collapse
      await clickItem(DATABASE_WITH_MULTIPLE_SCHEMAS);
      await waitLoading();
      await clickItem(DATABASE_WITH_MULTIPLE_SCHEMAS);
      await waitLoading();

      expect(item(PUBLIC_SCHEMA)).not.toBeInTheDocument();
      expect(item(PRIVATE_SCHEMA)).not.toBeInTheDocument();
    });

    it("flattens schemas with no names", async () => {
      const { onChange } = setup({ path: {} });

      await waitLoading();

      expect(item(DATABASE_WITH_UNNAMED_SCHEMA)).toBeInTheDocument();
      await clickItem(DATABASE_WITH_UNNAMED_SCHEMA);

      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_UNNAMED_SCHEMA.id,
      });

      // first for the schema
      await waitLoading();

      // the schema does not render itself but it's children are rendered directly
      expect(item(CORGE)).toBeInTheDocument();
      expect(item(GRAULT)).toBeInTheDocument();

      // Other schema's are still just rendered as normal
      expect(item(NAMED_SCHEMA)).toBeInTheDocument();
      expect(item(GLORP)).not.toBeInTheDocument();
    });

    it("automatically opens schemas when there is only one schema", async () => {
      const { onChange } = setup({ path: {} });

      await waitLoading();

      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toBeInTheDocument();
      await clickItem(DATABASE_WITH_SINGLE_SCHEMA);
      await waitLoading();

      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_SINGLE_SCHEMA.id,
      });

      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_SINGLE_SCHEMA.id,
        schemaName: SINGLE_SCHEMA.name,
      });

      // the schema is flattened into the parent
      expect(item(QUU)).toBeInTheDocument();
      expect(item(QUX)).toBeInTheDocument();
    });

    it("should be possible to navigate with the keyboard", async () => {
      const { onChange } = setup();

      await userEvent.click(await screen.findByRole("textbox"));

      // tab to the tree container (skips filter button)
      await userEvent.keyboard("{Tab}");
      await userEvent.keyboard("{Tab}");
      expect(screen.getByRole("treegrid")).toHaveFocus();

      // first arrow down activates the first row
      await userEvent.keyboard("{ArrowDown}");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveAttribute(
        "data-keyboard-active",
        "true",
      );

      // arrow down moves active indicator down
      await userEvent.keyboard("{ArrowDown}");
      expect(item(DATABASE_WITH_MULTIPLE_SCHEMAS)).toHaveAttribute(
        "data-keyboard-active",
        "true",
      );
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).not.toHaveAttribute(
        "data-keyboard-active",
      );

      // arrow up moves active indicator up
      await userEvent.keyboard("{ArrowUp}");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveAttribute(
        "data-keyboard-active",
        "true",
      );

      // right arrow opens the node (auto-expands since single schema)
      await userEvent.keyboard("{ArrowRight}");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      // arrow down moves to first table (QUU)
      await userEvent.keyboard("{ArrowDown}");
      expect(item(QUU)).toHaveAttribute("data-keyboard-active", "true");

      // arrow down again to move to next table (QUX)
      await userEvent.keyboard("{ArrowDown}");
      expect(item(QUX)).toHaveAttribute("data-keyboard-active", "true");

      // arrow up returns to first table
      await userEvent.keyboard("{ArrowUp}");
      expect(item(QUU)).toHaveAttribute("data-keyboard-active", "true");

      // arrow up again moves to parent database
      await userEvent.keyboard("{ArrowUp}");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveAttribute(
        "data-keyboard-active",
        "true",
      );

      // left arrow closes the node
      await userEvent.keyboard("{ArrowLeft}");
      await waitFor(() => {
        expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveAttribute(
          "aria-expanded",
          "false",
        );
      });

      // space toggles the node
      await userEvent.keyboard(" ");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      // space toggles the node again
      await userEvent.keyboard(" ");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      // enter selects the node (triggers onChange)
      await userEvent.keyboard("{Enter}");
      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_SINGLE_SCHEMA.id,
      });
    });

    it("shows the visibility layer for each table", async () => {
      const hiddenTable = createMockTable({
        id: nextId(),
        name: "HIDDEN_TABLE",
        display_name: "Hidden Table",
        schema: "public",
        data_layer: "hidden",
        fields: [],
      });
      const finalTable = createMockTable({
        id: nextId(),
        name: "FINAL_TABLE",
        display_name: "Final Table",
        schema: "public",
        data_layer: "final",
        fields: [],
      });
      const layerDatabase = createMockDatabase({
        id: nextId(),
        name: "LAYER_DATABASE",
        tables: [hiddenTable, finalTable],
      });

      setup({ databases: [layerDatabase] });
      await waitLoading();

      expect(
        await screen.findByText(hiddenTable.display_name),
      ).toBeInTheDocument();
      expect(item(finalTable)).toBeInTheDocument();

      const labels = screen
        .getAllByTestId("table-data-layer")
        .map((cell) => cell.textContent);
      expect(labels).toContain("Hidden");
      expect(labels).toContain("Final");
    });

    it("keeps the active table while its database is collapsed and restored", async () => {
      setup({
        path: {
          databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
          schemaName: FOO_TABLE.schema,
          tableId: FOO_TABLE.id,
        },
      });
      await waitLoading();

      const initialTableRow = tableItem(FOO_TABLE.id);
      expect(initialTableRow).toHaveAttribute("aria-selected", "true");
      if (!initialTableRow) {
        return;
      }

      await userEvent.click(within(initialTableRow).getByRole("checkbox"));
      expect(tableItem(FOO_TABLE.id)).toHaveAttribute("aria-selected", "false");

      await clickItem(DATABASE_WITH_MULTIPLE_SCHEMAS);
      expect(tableItem(FOO_TABLE.id)).not.toBeInTheDocument();
      await clickItem(DATABASE_WITH_MULTIPLE_SCHEMAS);

      await waitFor(() => {
        expect(tableItem(FOO_TABLE.id)).toBeInTheDocument();
      });
      const restoredTableRow = tableItem(FOO_TABLE.id);
      expect(restoredTableRow).toBeInTheDocument();
      if (!restoredTableRow) {
        return;
      }

      const restoredCheckbox = within(restoredTableRow).getByRole("checkbox");
      expect(restoredCheckbox).toBeChecked();
      await userEvent.click(restoredCheckbox);
      expect(tableItem(FOO_TABLE.id)).toHaveAttribute("aria-selected", "true");
    });

    it("renders a user owner, formatted row count, and published state", async () => {
      const table = createMockTable({
        id: nextId(),
        name: "KNOWN_OWNER",
        display_name: "Known Owner",
        schema: PUBLIC_SCHEMA.name,
        owner_user_id: currentUser.id,
        estimated_row_count: 3210,
        is_published: true,
      });

      const row = await setupMetadataTable(table);
      expect(row).toBeInTheDocument();
      if (!row) {
        return;
      }

      expect(within(row).getByTestId("table-owner")).toHaveTextContent(
        currentUser.common_name,
      );
      expect(within(row).getByTestId("table-expected-rows")).toHaveTextContent(
        "3,210",
      );
      expect(within(row).getByLabelText("Published")).toBeVisible();
    });

    it("renders an email owner and a zero row count", async () => {
      const table = createMockTable({
        id: nextId(),
        name: "EMAIL_OWNER",
        display_name: "Email Owner",
        schema: PUBLIC_SCHEMA.name,
        owner_user_id: null,
        owner_email: "owner@example.com",
        estimated_row_count: 0,
        is_published: false,
      });

      const row = await setupMetadataTable(table);
      expect(row).toBeInTheDocument();
      if (!row) {
        return;
      }

      expect(within(row).getByTestId("table-owner")).toHaveTextContent(
        "owner@example.com",
      );
      expect(within(row).getByTestId("table-expected-rows")).toHaveTextContent(
        "0",
      );
      expect(within(row).queryByLabelText("Published")).not.toBeInTheDocument();
    });

    it("omits empty owner and row count cells", async () => {
      const table = createMockTable({
        id: nextId(),
        name: "EMPTY_METADATA",
        display_name: "Empty Metadata",
        schema: PUBLIC_SCHEMA.name,
        owner_user_id: null,
        owner_email: null,
        estimated_row_count: null,
        is_published: false,
      });

      const row = await setupMetadataTable(table);
      expect(row).toBeInTheDocument();
      if (!row) {
        return;
      }

      expect(within(row).queryByTestId("table-owner")).not.toBeInTheDocument();
      expect(
        within(row).queryByTestId("table-expected-rows"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Search view", () => {
    it("should filter tables based on the search input", async () => {
      setup();

      await waitLoading();

      // Initially no tables should be visible in search mode
      await waitFor(() => {
        expect(item(FOO_TABLE)).not.toBeInTheDocument();
      });
      expect(item(BAR_TABLE)).not.toBeInTheDocument();

      await userEvent.type(searchInput(), "foo");
      await waitLoading();

      await waitFor(() => {
        expect(item(FOO_TABLE)).toBeInTheDocument();
      });
      expect(item(BAR_TABLE)).not.toBeInTheDocument();
    });

    it("selects a range of table checkboxes with shift+click", async () => {
      setup();
      await waitLoading();

      await userEvent.type(searchInput(), "Q");
      await waitFor(() => {
        expect(tableItem(QUU.id)).toBeInTheDocument();
        expect(tableItem(QUX.id)).toBeInTheDocument();
      });
      const firstRow = tableItem(QUU.id);
      const secondRow = tableItem(QUX.id);
      if (!firstRow || !secondRow) {
        return;
      }

      const firstCheckbox = within(firstRow).getByRole("checkbox");
      const secondCheckbox = within(secondRow).getByRole("checkbox");
      await userEvent.click(firstCheckbox);
      fireEvent.click(secondCheckbox, { shiftKey: true });

      expect(firstCheckbox).toBeChecked();
      expect(secondCheckbox).toBeChecked();
    });

    it("clears selected tables when filters or search terms change", async () => {
      setup();
      await waitLoading();

      const quuCheckbox = () =>
        within(screen.getByRole("row", { name: /Quu$/ })).getByRole("checkbox");

      await userEvent.type(searchInput(), "Q");
      expect(await screen.findByText(QUU.display_name)).toBeInTheDocument();

      await userEvent.click(quuCheckbox());
      expect(quuCheckbox()).toBeChecked();

      await openFilters();
      await selectFilterOption("Visibility layer", "Final");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(quuCheckbox()).not.toBeChecked());

      await userEvent.click(quuCheckbox());
      expect(quuCheckbox()).toBeChecked();

      await userEvent.type(searchInput(), "u");
      await waitFor(() => expect(quuCheckbox()).not.toBeChecked());
    });

    it("should render a message when no results are found", async () => {
      setup();

      await waitLoading();
      await userEvent.type(searchInput(), "nonexistent");
      await waitLoading();

      await waitFor(() => {
        expect(screen.getByText("No tables found")).toBeInTheDocument();
      });
    });

    it("should clear search and return to tree view", async () => {
      setup();

      await waitLoading();

      await userEvent.type(searchInput(), "foo");
      await waitLoading();

      await waitFor(() => {
        expect(item(FOO_TABLE)).toBeInTheDocument();
      });

      await userEvent.clear(searchInput());
      await waitLoading();

      // Should return to tree view with databases
      await waitFor(() => {
        expect(item(DATABASE_WITH_MULTIPLE_SCHEMAS)).toBeInTheDocument();
      });
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toBeInTheDocument();
    });

    it("should search case-insensitively", async () => {
      setup();

      await waitLoading();

      // Search with uppercase
      await userEvent.type(searchInput(), "BAR");
      await waitLoading();

      // Should find "Bar" table
      await waitFor(() => {
        expect(item(BAR_TABLE)).toBeInTheDocument();
      });
      expect(item(FOO_TABLE)).not.toBeInTheDocument();
    });

    it.each([
      { term: "oo", expectedText: "No tables found", expectedTableCount: 0 },
      {
        term: "Ite",
        expectedText: ORDER_ITEM_DISCOUNT_TABLE.display_name,
        expectedTableCount: 1,
      },
      {
        term: "irds",
        expectedText: "No tables found",
        expectedTableCount: 0,
      },
      {
        term: "*irds",
        expectedText: BIRDS_TABLE.display_name,
        expectedTableCount: 1,
      },
      {
        term: "what-a_cool%table\\name",
        expectedText: LITERAL_SEARCH_TABLE.display_name,
        expectedTableCount: 1,
      },
      {
        term: "what%a%cool%table%name",
        expectedText: "No tables found",
        expectedTableCount: 0,
      },
    ])(
      "matches '$term' with backend-equivalent semantics (UXW-5189)",
      async ({ term, expectedText, expectedTableCount }) => {
        setup({ databases: [SEARCH_SEMANTICS_DATABASE] });

        await waitLoading();
        await userEvent.type(searchInput(), term);
        await waitLoading();

        expect(await screen.findByText(expectedText)).toBeInTheDocument();
        expect(tableItems()).toHaveLength(expectedTableCount);
      },
    );

    it("should match tables from all databases in search", async () => {
      setup();

      await waitLoading();

      // Search for a pattern that matches tables in different databases
      await userEvent.type(searchInput(), "*o*");
      await waitLoading();

      // Should find FOO (from DATABASE_WITH_MULTIPLE_SCHEMAS)
      // and CORGE, GLORP (from DATABASE_WITH_UNNAMED_SCHEMA)
      await waitFor(() => {
        expect(item(FOO_TABLE)).toBeInTheDocument();
      });
      expect(item(CORGE)).toBeInTheDocument();
      expect(item(GLORP)).toBeInTheDocument();

      // Should not find tables without "o"
      expect(item(BAR_TABLE)).not.toBeInTheDocument();
      expect(item(QUU)).not.toBeInTheDocument();
      expect(item(QUX)).not.toBeInTheDocument();
      expect(item(GRAULT)).not.toBeInTheDocument();
    });

    it("routes to the selected result when table names are duplicated", async () => {
      const domesticAnimals = createMockTable({
        id: nextId(),
        name: "DOMESTIC_ANIMALS",
        display_name: "Animals",
        schema: "Domestic",
      });
      const wildAnimals = createMockTable({
        id: nextId(),
        name: "WILD_ANIMALS",
        display_name: "Animals",
        schema: "Wild",
      });
      const database = createMockDatabase({
        id: nextId(),
        name: "Duplicate tables",
        tables: [domesticAnimals, wildAnimals],
      });
      const { onChange } = setup({ databases: [database] });

      await waitLoading();
      await userEvent.type(searchInput(), "Ani");
      await waitLoading();

      await waitFor(() => {
        expect(screen.getAllByText("Animals")).toHaveLength(2);
      });
      const wildRow = tableItem(wildAnimals.id);
      expect(wildRow).toBeInTheDocument();
      if (wildRow) {
        await userEvent.click(wildRow);
      }

      expect(onChange).toHaveBeenCalledWith({
        databaseId: database.id,
        schemaName: wildAnimals.schema,
        tableId: wildAnimals.id,
      });
    });
  });

  describe("Filters", () => {
    it("is hidden when the Library is not enabled", async () => {
      setup();
      await waitLoading();

      await userEvent.click(screen.getByRole("button", { name: "Filter" }));

      expect(
        await screen.findByTestId("table-picker-filter"),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Published tables only"),
      ).not.toBeInTheDocument();
    });

    it.each(FILTER_REQUEST_CASES)(
      "maps $name to the table search request",
      async ({ selectFilter, expectedParams, tokenFeatures }) => {
        const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
        trackSimpleEvent.mockClear();
        setup({ tokenFeatures });
        await waitLoading();

        await openFilters();
        await selectFilter();
        await userEvent.click(screen.getByRole("button", { name: "Apply" }));

        await expectTableSearchParams(expectedParams);
        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "data_studio_table_picker_filters_applied",
        });
        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "data_studio_table_picker_search_performed",
        });
      },
    );

    it("does not offer an unsupported unspecified source filter (UXW-5189)", async () => {
      setup();
      await waitLoading();

      await openFilters();
      await userEvent.click(screen.getByRole("textbox", { name: "Source" }));

      expect(
        screen.getByRole("option", { name: "Uploaded data" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("option", { name: "Unspecified" }),
      ).not.toBeInTheDocument();
    });

    it("closes the filter popover when clicking outside", async () => {
      setup();
      await waitLoading();

      await openFilters();
      await userEvent.click(searchInput());

      expect(
        screen.queryByTestId("table-picker-filter"),
      ).not.toBeInTheDocument();
    });

    it("hides stale results while a filter request is in flight (UXW-5189)", async () => {
      const initialTables = [
        { ...FOO_TABLE, db_id: DATABASE_WITH_MULTIPLE_SCHEMAS.id },
      ];
      const filteredTables = [
        { ...BAR_TABLE, db_id: DATABASE_WITH_MULTIPLE_SCHEMAS.id },
      ];
      let resolveFilteredTables: (tables: Table[]) => void = () => {};
      const filteredTablesRequest = new Promise<Table[]>((resolve) => {
        resolveFilteredTables = resolve;
      });
      setup();
      fetchMock.modifyRoute("table-search", {
        response: (call) => {
          const dataLayer = new URL(call.url).searchParams.get("data-layer");
          return dataLayer === "final" ? filteredTablesRequest : initialTables;
        },
      });
      await waitLoading();

      await userEvent.type(searchInput(), "*");
      expect(
        await screen.findByText(FOO_TABLE.display_name),
      ).toBeInTheDocument();

      await openFilters();
      await selectFilterOption("Visibility layer", "Final");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));

      await waitFor(() => {
        expect(fetchMock.callHistory.calls("table-search")).toHaveLength(2);
      });
      expect(screen.getByTestId("loading-indicator")).toBeVisible();
      expect(tableItem(FOO_TABLE.id)).not.toBeInTheDocument();
      resolveFilteredTables(filteredTables);

      expect(
        await screen.findByText(BAR_TABLE.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("Analytics", () => {
    it("tracks a table search request", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      trackSimpleEvent.mockClear();
      setup();
      await waitLoading();

      await userEvent.type(searchInput(), "foo");

      await waitFor(() => {
        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "data_studio_table_picker_search_performed",
        });
      });

      await userEvent.type(searchInput(), "d");
      expect(await screen.findByText("No tables found")).toBeInTheDocument();
      await waitFor(() => {
        const searchEvents = trackSimpleEvent.mock.calls.filter(
          ([event]) =>
            event.event === "data_studio_table_picker_search_performed",
        );
        expect(searchEvents).toHaveLength(2);
      });
    });
  });
});

function searchInput() {
  return screen.getByPlaceholderText("Search tables");
}

function tableItem(tableId: Table["id"]) {
  return (
    tableItems().find(
      (row) => row.getAttribute("data-table-id") === String(tableId),
    ) ?? null
  );
}

function tableItems() {
  return screen
    .queryAllByTestId("tree-item")
    .filter((row) => row.hasAttribute("data-table-id"));
}

async function setupMetadataTable(table: Table) {
  const database = createMockDatabase({
    id: nextId(),
    name: "Metadata database",
    tables: [table],
  });
  setup({ databases: [database], tokenFeatures: { library: true } });
  await waitLoading();
  await waitFor(() => {
    expect(tableItem(table.id)).toBeInTheDocument();
  });
  return tableItem(table.id);
}

async function openFilters() {
  await userEvent.click(screen.getByRole("button", { name: "Filter" }));
  expect(await screen.findByTestId("table-picker-filter")).toBeInTheDocument();
}

async function selectFilterOption(label: string, option: string) {
  const filterForm = screen.getByTestId("table-picker-filter");
  await userEvent.click(
    within(filterForm).getByRole("textbox", { name: label }),
  );
  const listbox = await within(filterForm).findByRole("listbox", {
    name: label,
  });
  await userEvent.click(within(listbox).getByText(option));
}

async function selectOwnerEmail() {
  const email = "owner@example.com";
  const filterForm = screen.getByTestId("table-picker-filter");
  await userEvent.type(
    within(filterForm).getByRole("textbox", { name: "Owner" }),
    email,
  );
  await userEvent.click(await within(filterForm).findByText(email));
}

async function expectTableSearchParams(expectedParams: Record<string, string>) {
  await waitFor(() => {
    expect(fetchMock.callHistory.calls("table-search")).toHaveLength(1);
  });
  const lastCall = fetchMock.callHistory.calls("table-search").at(-1);
  expect(lastCall).toBeDefined();
  if (!lastCall) {
    return;
  }

  expect(Object.fromEntries(new URL(lastCall.url).searchParams)).toEqual({
    term: "",
    ...expectedParams,
  });
}

async function waitLoading() {
  await waitFor(() => {
    expect(screen.queryByTestId("loading-placeholder")).not.toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.queryByTestId("loading-placeholder")).not.toBeInTheDocument();
  });
}

function item(input: string | { display_name?: string; name: string } | null) {
  if (input === null) {
    throw new Error("item() was called with null");
  }

  const name =
    typeof input === "string" ? input : (input.display_name ?? input.name);
  const textElement = screen.queryByText(name);
  if (!textElement) {
    return null;
  }
  return textElement.closest('[data-testid="tree-item"]') ?? null;
}

async function clickItem(
  input: string | { display_name?: string; name: string } | null,
) {
  const node = item(input);
  expect(node).toBeInTheDocument();
  if (node) {
    await userEvent.click(node);
  }
}
