import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseConfigTable } from "./DatabaseConfigTable";

type SetupOpts = {
  configs: WorkspaceDatabase[];
  databases: Database[];
  withStatus?: boolean;
};

function setup({ configs, databases, withStatus = false }: SetupOpts) {
  const onRowClick = jest.fn<void, [WorkspaceDatabase]>();
  renderWithProviders(
    <DatabaseConfigTable
      configs={configs}
      databasesById={
        new Map(databases.map((database) => [database.id, database]))
      }
      withStatus={withStatus}
      onRowClick={onRowClick}
    />,
  );
  return { onRowClick };
}

describe("DatabaseConfigTable", () => {
  it("should call onRowClick when a row is clicked", async () => {
    const database = createMockDatabase({ name: "Postgres" });
    const config = createMockWorkspaceDatabase({ database_id: database.id });
    const { onRowClick } = setup({
      configs: [config],
      databases: [database],
    });

    await userEvent.click(screen.getByText("Postgres"));

    expect(onRowClick).toHaveBeenCalledWith(config);
  });
});
