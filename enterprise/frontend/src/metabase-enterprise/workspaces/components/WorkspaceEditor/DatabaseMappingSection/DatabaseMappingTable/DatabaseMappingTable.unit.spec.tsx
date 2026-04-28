import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseMappingTable } from "./DatabaseMappingTable";

type SetupOpts = {
  mappings: WorkspaceDatabase[];
  databases: Database[];
  withStatus?: boolean;
};

function setup({ mappings, databases, withStatus = false }: SetupOpts) {
  const onRowClick = jest.fn<void, [WorkspaceDatabase]>();
  renderWithProviders(
    <DatabaseMappingTable
      mappings={mappings}
      databasesById={
        new Map(databases.map((database) => [database.id, database]))
      }
      withStatus={withStatus}
      onRowClick={onRowClick}
    />,
  );
  return { onRowClick };
}

describe("DatabaseMappingTable", () => {
  it("should call onRowClick when a row is clicked", async () => {
    const database = createMockDatabase({ name: "Postgres" });
    const mapping = createMockWorkspaceDatabase({ database_id: database.id });
    const { onRowClick } = setup({
      mappings: [mapping],
      databases: [database],
    });

    await userEvent.click(screen.getByText("Postgres"));

    expect(onRowClick).toHaveBeenCalledWith(mapping);
  });
});
