import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDatabase,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceDatabaseInfo } from "./WorkspaceDatabaseInfo";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });

describe("WorkspaceDatabaseInfo", () => {
  it("renders the database name and schema pills when the database is found", () => {
    renderWithProviders(
      <WorkspaceDatabaseInfo
        workspaceDatabase={createMockWorkspaceDatabase({
          database_id: POSTGRES.id,
          input_schemas: ["public", "analytics"],
        })}
        availableDatabases={[POSTGRES]}
      />,
    );

    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText("public")).toBeInTheDocument();
    expect(screen.getByText("analytics")).toBeInTheDocument();
  });

  it("falls back to a `Database <id>` label when the database is not in the list", () => {
    renderWithProviders(
      <WorkspaceDatabaseInfo
        workspaceDatabase={createMockWorkspaceDatabase({
          database_id: 999,
          input_schemas: [],
        })}
        availableDatabases={[POSTGRES]}
      />,
    );

    expect(screen.getByText("Database 999")).toBeInTheDocument();
  });
});
