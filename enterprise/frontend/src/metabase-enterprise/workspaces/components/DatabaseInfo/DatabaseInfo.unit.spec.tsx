import { renderWithProviders, screen } from "__support__/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseInfo } from "./DatabaseInfo";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });

type SetupOpts = {
  workspaceDatabase?: WorkspaceDatabase;
  database?: Database;
};

function setup({
  workspaceDatabase = createMockWorkspaceDatabase({ database_id: POSTGRES.id }),
  database = POSTGRES,
}: SetupOpts = {}) {
  renderWithProviders(
    <DatabaseInfo workspaceDatabase={workspaceDatabase} database={database} />,
  );
}

describe("DatabaseInfo", () => {
  it("renders the database name and schema pills when the database is found", () => {
    setup({
      workspaceDatabase: createMockWorkspaceDatabase({
        database_id: POSTGRES.id,
        input_schemas: ["public", "analytics"],
      }),
    });

    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText("public")).toBeInTheDocument();
    expect(screen.getByText("analytics")).toBeInTheDocument();
  });

  it("shows a 'more' pill when there are more than 10 schemas", () => {
    const schemas = Array.from({ length: 13 }, (_, i) => `schema_${i + 1}`);

    setup({
      workspaceDatabase: createMockWorkspaceDatabase({
        database_id: POSTGRES.id,
        input_schemas: schemas,
      }),
    });

    expect(screen.getByText("schema_1")).toBeInTheDocument();
    expect(screen.getByText("schema_10")).toBeInTheDocument();
    expect(screen.queryByText("schema_11")).not.toBeInTheDocument();
    expect(screen.getByText("And 3 more")).toBeInTheDocument();
  });
});
