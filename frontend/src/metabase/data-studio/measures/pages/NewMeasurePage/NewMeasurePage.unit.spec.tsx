import { Route } from "react-router";

import { setupSchemaEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import type { Table } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { NewMeasurePage } from "./NewMeasurePage";

const TEST_DATABASE = createMockDatabase({
  id: 1,
  name: "Test Database",
});

type SetupOpts = {
  table: Table;
};

function setup({ table }: SetupOpts) {
  setupSchemaEndpoints(TEST_DATABASE);

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <NewMeasurePage
          route={{ path: "/" } as never}
          table={table}
          breadcrumbs={<div />}
          getSuccessUrl={() => "/success"}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: {
        entities: createMockEntitiesState({
          databases: [TEST_DATABASE],
          tables: [table],
        }),
        settings: createMockSettingsState({}),
      },
    },
  );
}

describe("NewMeasurePage", () => {
  it("shows aggregation function picker even if table is hidden (UXW-2889)", async () => {
    setup({
      table: createMockTable({
        visibility_type: "hidden",
      }),
    });
    expect(
      screen.getByText("Pick an aggregation function"),
    ).toBeInTheDocument();
  });
});
