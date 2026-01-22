import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupTableSearchEndpoint,
  setupUserKeyValueEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { SelectionProvider } from "metabase-enterprise/data-studio/data-model/pages/DataModel/contexts/SelectionContext";
import type { Database, User } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSchema,
  createMockTable,
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

function setup({
  path = {},
  databases = MOCK_DATABASES,
}: {
  path?: TreePath;
  databases?: Database[];
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

  const onChange = jest.fn();
  const setOnUpdateCallback = jest.fn();
  const params = {};

  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <SelectionProvider>
          <UncontrolledTablePicker
            initialValue={path}
            onChange={onChange}
            params={params}
            setOnUpdateCallback={setOnUpdateCallback}
          />
        </SelectionProvider>
      )}
    />,
    { withRouter: true },
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

    it("should support partial matching", async () => {
      setup();

      await waitLoading();

      // Search for partial string "oo" should match "Foo"
      await userEvent.type(searchInput(), "oo");
      await waitLoading();

      await waitFor(() => {
        expect(item(FOO_TABLE)).toBeInTheDocument();
      });
      expect(item(BAR_TABLE)).not.toBeInTheDocument();

      // Clear and search for "ar" should match "Bar"
      await userEvent.clear(searchInput());
      await waitLoading();

      await userEvent.type(searchInput(), "ar");
      await waitLoading();

      await waitFor(() => {
        expect(item(BAR_TABLE)).toBeInTheDocument();
      });
      expect(item(FOO_TABLE)).not.toBeInTheDocument();
    });

    it("should support wildcard search with *", async () => {
      setup();

      await waitLoading();

      // Search with wildcard pattern
      await userEvent.type(searchInput(), "Q*");
      await waitLoading();

      // Should match both QUU and QUX
      await waitFor(() => {
        expect(item(QUU)).toBeInTheDocument();
      });
      expect(item(QUX)).toBeInTheDocument();
      expect(item(FOO_TABLE)).not.toBeInTheDocument();
      expect(item(BAR_TABLE)).not.toBeInTheDocument();
    });

    it("should match tables from all databases in search", async () => {
      setup();

      await waitLoading();

      // Search for a pattern that matches tables in different databases
      await userEvent.type(searchInput(), "o");
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
  });
});

function searchInput() {
  return screen.getByRole("textbox");
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
  return (textElement.closest('[data-testid="tree-item"]') ??
    null) as HTMLElement | null;
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
