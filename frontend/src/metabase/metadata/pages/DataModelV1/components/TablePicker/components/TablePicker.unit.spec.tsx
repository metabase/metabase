import userEvent from "@testing-library/user-event";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import type { Database, SearchResult } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSchema,
  createMockSearchResult,
  createMockTable,
} from "metabase-types/api/mocks";

import type { TreePath } from "../types";
import { UncontrolledTablePicker } from "../wrappers";

let id = 1000;
function nextId() {
  return id++;
}

beforeEach(() => {
  // so the virtual list renders correctly in the tests
  mockGetBoundingClientRect();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const PUBLIC = createMockSchema({
  id: "PUBLIC",
  name: "PUBLIC",
});

const PRIVATE = createMockSchema({
  id: "PRIVATE",
  name: "PRIVATE",
});

const FOO = createMockTable({
  id: nextId(),
  name: "FOO",
  display_name: "Foo",
  schema: PRIVATE.id,
  fields: [],
});

const BAR = createMockTable({
  id: nextId(),
  name: "BAR",
  display_name: "Bar",
  schema: PUBLIC.id,
  fields: [],
});

const DATABASE_WITH_MULTIPLE_SCHEMAS = createMockDatabase({
  id: nextId(),
  name: "DATABASE_WITH_MULTIPLE_SCHEMAS",
  tables: [FOO, BAR],
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

function setup({
  path = {},
  databases = MOCK_DATABASES,
  searchResults = [],
}: {
  path?: TreePath;
  databases?: Database[];
  searchResults?: SearchResult[];
} = {}) {
  setupDatabasesEndpoints(databases);
  setupSearchEndpoints(searchResults);

  const onChange = jest.fn();

  renderWithProviders(
    <UncontrolledTablePicker initialValue={path} onChange={onChange} />,
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

      expect(item(PRIVATE)).toBeInTheDocument();
      expect(item(PUBLIC)).toBeInTheDocument();
      expect(item(PUBLIC)).toBeInTheDocument();

      await clickItem(PUBLIC);
      await waitLoading();

      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
        schemaName: PUBLIC.name,
      });

      expect(item(FOO)).not.toBeInTheDocument();
      expect(item(BAR)).toBeInTheDocument();

      await clickItem(BAR);

      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
        schemaName: PUBLIC.name,
        tableId: BAR.id,
      });

      await clickItem(PUBLIC);
      await waitLoading();

      expect(item(FOO)).not.toBeInTheDocument();
      expect(item(BAR)).not.toBeInTheDocument();

      await clickItem(DATABASE_WITH_MULTIPLE_SCHEMAS);
      await waitLoading();

      expect(item(PUBLIC)).not.toBeInTheDocument();
      expect(item(PRIVATE)).not.toBeInTheDocument();
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

      // focus the first item
      await userEvent.keyboard("{Tab}");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveFocus();

      // arrow down moves focus down
      await userEvent.keyboard("{ArrowDown}");
      expect(item(DATABASE_WITH_MULTIPLE_SCHEMAS)).toHaveFocus();

      // arrow up moves focus up
      await userEvent.keyboard("{ArrowUp}");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveFocus();

      // right arrow opens the node
      await userEvent.keyboard("{ArrowRight}");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)?.dataset.open).toBe("true");

      // arrow down moves focus down
      await userEvent.keyboard("{ArrowDown}");
      expect(item(QUU)).toHaveFocus();

      // left moves focus to the parent node
      await userEvent.keyboard("{ArrowLeft}");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)).toHaveFocus();

      // left arrow closes the node
      await userEvent.keyboard("{ArrowLeft}");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)?.dataset.open).toBe(undefined);

      // space toggles the node
      await userEvent.keyboard(" ");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)?.dataset.open).toBe("true");

      // space toggles the node
      await userEvent.keyboard(" ");
      expect(item(DATABASE_WITH_SINGLE_SCHEMA)?.dataset.open).toBe(undefined);

      // enter selects the node
      await userEvent.keyboard("{Enter}");
      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_SINGLE_SCHEMA.id,
      });
    });
  });

  describe("Search view", () => {
    const DATABASE = "DATABASE";
    const SCHEMA = "SCHEMA";
    const FOO_RESULT = createMockSearchResult({
      id: nextId(),
      model: "table",
      name: "Foo",
      table_name: "FOO",
      table_schema: SCHEMA,
      database_name: DATABASE,
      initial_sync_status: "complete",
    });
    const BAR_RESULT = createMockSearchResult({
      id: nextId(),
      model: "table",
      name: "Bar",
      table_name: "BAR",
      table_schema: SCHEMA,
      database_name: DATABASE,
      initial_sync_status: "complete",
    });

    const SEARCH_RESULTS = [FOO_RESULT, BAR_RESULT];

    it("should filter the tree based on the search input", async () => {
      const { onChange } = setup({
        searchResults: SEARCH_RESULTS,
      });

      await userEvent.type(searchInput(), "foo");

      expect(item(DATABASE)).toBeInTheDocument();
      expect(item(SCHEMA)).toBeInTheDocument();

      expect(item(FOO_RESULT)).toBeInTheDocument();
      expect(item(BAR_RESULT)).not.toBeInTheDocument();

      await clickItem(FOO_RESULT);
      expect(onChange).toHaveBeenCalledWith({
        databaseId: FOO_RESULT.database_id,
        schemaName: FOO_RESULT.table_schema,
        tableId: FOO_RESULT.id,
      });
    });

    it("should render a message when no results are found", async () => {
      setup();

      await userEvent.type(searchInput(), "foo");

      expect(screen.getByText("No results.")).toBeInTheDocument();
    });

    it("should be possible to use the keyboard to select items in the search results", async () => {
      const { onChange } = setup({
        searchResults: SEARCH_RESULTS,
      });

      await userEvent.type(searchInput(), "foo");

      expect(item(DATABASE)).toBeInTheDocument();
      expect(item(SCHEMA)).toBeInTheDocument();

      expect(item(FOO_RESULT)).toBeInTheDocument();
      expect(item(BAR_RESULT)).not.toBeInTheDocument();

      await userEvent.type(searchInput(), "{ArrowDown}");
      await userEvent.type(searchInput(), "{Enter}");

      expect(onChange).toHaveBeenCalledWith({
        databaseId: FOO_RESULT.database_id,
        schemaName: FOO_RESULT.table_schema,
        tableId: FOO_RESULT.id,
      });
    });

    it("should not crash when pressing Enter with no item selected (metabase#63350)", async () => {
      const { onChange } = setup({
        searchResults: SEARCH_RESULTS,
      });

      await userEvent.type(searchInput(), "search");

      await userEvent.type(searchInput(), "{Enter}");

      expect(onChange).not.toHaveBeenCalled();
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
  return (screen.queryByText(name)?.parentNode?.parentNode?.parentNode ??
    null) as HTMLAnchorElement | null;
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
