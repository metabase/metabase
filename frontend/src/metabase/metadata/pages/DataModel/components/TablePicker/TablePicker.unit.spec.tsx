import userEvent from "@testing-library/user-event";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSchema,
  createMockTable,
} from "metabase-types/api/mocks";

import type { TreePath } from "./types";

import { UncontrolledTablePicker } from ".";

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
  schema: PRIVATE.id,
  fields: [],
});

const BAR = createMockTable({
  id: nextId(),
  name: "BAR",
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
  schema: SINGLE_SCHEMA.name,
});

const QUX = createMockTable({
  id: nextId(),
  name: "QUX",
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
});

const GRAULT = createMockTable({
  id: nextId(),
  schema: UNNAMED_SCHEMA.name,
  name: "GRAULT",
});

const GLORP = createMockTable({
  id: nextId(),
  schema: NAMED_SCHEMA.name,
  name: "GLORP",
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
}: {
  path?: TreePath;
  databases?: Database[];
} = {}) {
  setupDatabasesEndpoints(databases);

  const onChange = jest.fn();

  renderWithProviders(
    <UncontrolledTablePicker initialValue={path} onChange={onChange} />,
  );
  return { onChange };
}

describe("TablePicker", () => {
  it("renders databases and unfurls nested items", async () => {
    const { onChange } = setup({ path: {} });

    await waitLoading();

    expect(item(DATABASE_WITH_MULTIPLE_SCHEMAS)).toBeInTheDocument();
    expect(item(DATABASE_WITH_MULTIPLE_SCHEMAS)).toBeInTheDocument();

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
      schemaId: PUBLIC.id,
    });

    expect(item(FOO)).not.toBeInTheDocument();
    expect(item(BAR)).toBeInTheDocument();

    await clickItem(BAR);

    expect(onChange).toHaveBeenCalledWith({
      databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
      schemaId: PUBLIC.name,
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
      schemaId: SINGLE_SCHEMA.name,
    });

    // the schema is expanded and renders its children tables
    expect(item(SINGLE_SCHEMA)).toBeInTheDocument();
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

    // left arrow closes the node
    await userEvent.keyboard("{ArrowLeft}");
    expect(item(DATABASE_WITH_SINGLE_SCHEMA)?.dataset.open).toBe(undefined);

    // space toggles the node
    await userEvent.keyboard(" ");
    expect(item(DATABASE_WITH_SINGLE_SCHEMA)?.dataset.open).toBe("true");

    await userEvent.keyboard(" ");
    expect(item(DATABASE_WITH_SINGLE_SCHEMA)?.dataset.open).toBe(undefined);

    // enter selects the node
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith({
      databaseId: DATABASE_WITH_SINGLE_SCHEMA.id,
    });
  });
});

async function clickItem({ name }: { name: string }) {
  const node = await screen.findByText(name);
  act(() => {
    node.click();
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

function item({ name }: { name: string }) {
  return (screen.queryByText(name)?.parentNode?.parentNode ??
    null) as HTMLDivElement | null;
}
