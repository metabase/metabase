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

async function clickNode(name: string) {
  const node = await screen.findByText(name);
  act(() => {
    node.click();
  });
}

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

    expect(
      await screen.findByText(DATABASE_WITH_MULTIPLE_SCHEMAS.name),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(DATABASE_WITH_MULTIPLE_SCHEMAS.name),
    ).toBeInTheDocument();
    await clickNode(DATABASE_WITH_MULTIPLE_SCHEMAS.name);

    expect(onChange).toHaveBeenCalledWith({
      databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
    });

    expect(await screen.findByText(PRIVATE.name)).toBeInTheDocument();
    expect(await screen.findByText(PUBLIC.name)).toBeInTheDocument();

    expect(await screen.findByText(PUBLIC.name)).toBeInTheDocument();
    await clickNode(PUBLIC.name);

    expect(onChange).toHaveBeenCalledWith({
      databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
      schemaId: PUBLIC.id,
    });

    expect(screen.queryByText(FOO.name)).not.toBeInTheDocument();

    expect(await screen.findByText(BAR.name)).toBeInTheDocument();
    await clickNode(BAR.name);

    expect(onChange).toHaveBeenCalledWith({
      databaseId: DATABASE_WITH_MULTIPLE_SCHEMAS.id,
      schemaId: PUBLIC.name,
      tableId: BAR.id,
    });

    await clickNode(PUBLIC.name);

    expect(screen.queryByText(FOO.name)).not.toBeInTheDocument();
    expect(screen.queryByText(BAR.name)).not.toBeInTheDocument();

    await clickNode(DATABASE_WITH_MULTIPLE_SCHEMAS.name);
    expect(screen.queryByText(PUBLIC.name)).not.toBeInTheDocument();
    expect(screen.queryByText(PRIVATE.name)).not.toBeInTheDocument();
  });

  it("flattens schemas with no names", async () => {
    const { onChange } = setup({ path: {} });

    expect(
      await screen.findByText(DATABASE_WITH_UNNAMED_SCHEMA.name),
    ).toBeInTheDocument();
    await clickNode(DATABASE_WITH_UNNAMED_SCHEMA.name);

    expect(onChange).toHaveBeenCalledWith({
      databaseId: DATABASE_WITH_UNNAMED_SCHEMA.id,
    });

    // the schema does not render itself but it's children are rendered directly
    expect(await screen.findByText(CORGE.name)).toBeInTheDocument();
    expect(await screen.findByText(GRAULT.name)).toBeInTheDocument();

    // Other schema's are still just rendered as normal
    expect(await screen.findByText(NAMED_SCHEMA.name)).toBeInTheDocument();
    expect(screen.queryByText(GLORP.name)).not.toBeInTheDocument();
  });

  it("automatically opens schemas when there is only one schema", async () => {
    const { onChange } = setup({ path: {} });

    expect(
      await screen.findByText(DATABASE_WITH_SINGLE_SCHEMA.name),
    ).toBeInTheDocument();
    await clickNode(DATABASE_WITH_SINGLE_SCHEMA.name);

    expect(onChange).toHaveBeenCalledWith({
      databaseId: DATABASE_WITH_SINGLE_SCHEMA.id,
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        databaseId: DATABASE_WITH_SINGLE_SCHEMA.id,
        schemaId: SINGLE_SCHEMA.name,
      });
    });

    // the schema is expanded and renders its children tables
    expect(await screen.findByText(SINGLE_SCHEMA.name)).toBeInTheDocument();
    expect(await screen.findByText(QUU.name)).toBeInTheDocument();
    expect(await screen.findByText(QUX.name)).toBeInTheDocument();
  });
});
