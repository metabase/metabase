import {
  setupSchemaEndpoints,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { Table } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { TableBreadcrumbs } from "./TableBreadcrumbs";

interface SetupOpts {
  hideTableName?: boolean;
  table: Table;
}

const setup = ({ hideTableName, table }: SetupOpts) => {
  setupTablesEndpoints([table]);
  setupSchemaEndpoints(checkNotNull(table.db));

  return renderWithProviders(
    <TableBreadcrumbs hideTableName={hideTableName} tableId={table.id} />,
  );
};

describe("TableBreadcrumbs", () => {
  const TEST_TABLE = createMockTable({
    display_name: "My table",
    schema: "My schema",
    db: createMockDatabase({
      name: "My database",
    }),
  });

  describe("single schema or no schema", () => {
    it("should show database name and table name", async () => {
      setup({ table: TEST_TABLE });

      expect(await screen.findByText("My database")).toBeInTheDocument();
      expect(screen.queryByText("My schema")).not.toBeInTheDocument();
      expect(screen.getByText("My table")).toBeInTheDocument();
    });

    it("should not show table name when 'hideTableName' is true", async () => {
      setup({ table: TEST_TABLE, hideTableName: true });

      expect(await screen.findByText("My database")).toBeInTheDocument();
      expect(screen.queryByText("My schema")).not.toBeInTheDocument();
      expect(screen.queryByText("My table")).not.toBeInTheDocument();
    });
  });

  describe("multiple schemas", () => {
    const TEST_TABLE = createMockTable({
      display_name: "My table",
      schema: "My schema",
      db: createMockDatabase({
        name: "My database",
        tables: [
          createMockTable({ schema: "My schema" }),
          createMockTable({ schema: "Other schema" }),
        ],
      }),
    });

    it("should show schema name if database has multiple schemas", async () => {
      setup({ table: TEST_TABLE });

      expect(await screen.findByText("My database")).toBeInTheDocument();
      expect(screen.getByText("My schema")).toBeInTheDocument();
      expect(screen.getByText("My table")).toBeInTheDocument();
    });
  });
});
