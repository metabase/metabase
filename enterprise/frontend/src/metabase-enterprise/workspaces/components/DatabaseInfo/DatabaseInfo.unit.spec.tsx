import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDatabase,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseInfo } from "./DatabaseInfo";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });

describe("DatabaseInfo", () => {
  it("renders the database name and schema pills when the database is found", () => {
    renderWithProviders(
      <DatabaseInfo
        workspaceDatabase={createMockWorkspaceDatabase({
          database_id: POSTGRES.id,
          input_schemas: ["public", "analytics"],
        })}
        database={POSTGRES}
      />,
    );

    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText("public")).toBeInTheDocument();
    expect(screen.getByText("analytics")).toBeInTheDocument();
  });
});
