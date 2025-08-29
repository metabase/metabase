import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import TableBrowser from "./TableBrowser";

const setup = (table) => {
  setupDatabaseEndpoints(createMockDatabase());
  renderWithProviders(
    <TableBrowser
      tables={[table]}
      dbId={1}
      getTableUrl={() => `/question/${table.id}`}
      xraysEnabled={true}
    />,
  );
};

describe("TableBrowser", () => {
  it("should render synced tables", () => {
    setup({ id: 1, name: "Orders", initial_sync_status: "complete" });

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("bolt icon")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("should render syncing tables", () => {
    setup({ id: 1, name: "Orders", initial_sync_status: "incomplete" });

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByLabelText("bolt icon")).not.toBeInTheDocument();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should render tables with a sync error", () => {
    setup({ id: 1, name: "Orders", initial_sync_status: "aborted" });

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("bolt icon")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });
});
