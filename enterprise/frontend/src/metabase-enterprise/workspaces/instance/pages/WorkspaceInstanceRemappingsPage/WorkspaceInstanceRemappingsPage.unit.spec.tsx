import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupListTableRemappingsEndpoint,
  setupListTableRemappingsEndpointError,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import {
  getBrokenUpTextMatcher,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Urls from "metabase/urls";
import type { Database, Table, TableRemapping } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockTableRemapping,
} from "metabase-types/api/mocks";

import { WorkspaceInstanceRemappingsPage } from "./WorkspaceInstanceRemappingsPage";

type SetupOpts = {
  remappings?: TableRemapping[];
  databases?: Database[];
  tables?: Table[];
  withRemappingsError?: boolean;
};

function setup({
  remappings = [],
  databases = [createMockDatabase({ id: 1, name: "Sample DB" })],
  tables = [],
  withRemappingsError = false,
}: SetupOpts = {}) {
  if (withRemappingsError) {
    setupListTableRemappingsEndpointError();
  } else {
    setupListTableRemappingsEndpoint(remappings);
  }
  setupDatabasesEndpoints(databases);
  tables.forEach((table) => setupTableQueryMetadataEndpoint(table));
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  return renderWithProviders(
    <Route
      path={Urls.workspaceInstanceRemappings()}
      component={WorkspaceInstanceRemappingsPage}
    />,
    {
      withRouter: true,
      initialRoute: Urls.workspaceInstanceRemappings(),
    },
  );
}

function getTable() {
  return screen.getByTestId("remapping-table");
}

function getDataRows() {
  return within(getTable()).queryAllByRole("row");
}

function getCellByText(parent: HTMLElement, text: string) {
  return within(parent).getByText(getBrokenUpTextMatcher(text));
}

function queryCellByText(parent: HTMLElement, text: string) {
  return within(parent).queryByText(getBrokenUpTextMatcher(text));
}

async function searchFor(query: string) {
  const input = screen.getByTestId("remappings-search-input");
  await userEvent.clear(input);
  await userEvent.type(input, query);
}

describe("WorkspaceInstanceRemappingsPage", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should render one row per remapping with from/to/database/created_at", async () => {
    setup({
      remappings: [
        createMockTableRemapping({
          id: 1,
          database_id: 1,
          from_schema: "public",
          from_table_name: "orders",
          to_schema: "workspace",
          to_table_name: "orders_clean",
          created_at: "2024-03-15T12:00:00Z",
        }),
        createMockTableRemapping({
          id: 2,
          database_id: 1,
          from_schema: "raw",
          from_table_name: "events",
          to_schema: "workspace",
          to_table_name: "events_clean",
          created_at: "2024-03-15T12:00:00Z",
        }),
      ],
      databases: [createMockDatabase({ id: 1, name: "Sample DB" })],
    });

    await waitFor(() => {
      expect(getDataRows()).toHaveLength(2);
    });

    const table = getTable();
    expect(getCellByText(table, "public/orders")).toBeInTheDocument();
    expect(getCellByText(table, "workspace/orders_clean")).toBeInTheDocument();
    expect(getCellByText(table, "raw/events")).toBeInTheDocument();
    expect(getCellByText(table, "workspace/events_clean")).toBeInTheDocument();
    expect(within(table).getAllByText("Sample DB")).toHaveLength(2);
  });

  it("should show the empty state when there are no remappings", async () => {
    setup({ remappings: [] });

    expect(
      await screen.findByText(
        /Transforms create tables in the isolation schema/i,
      ),
    ).toBeInTheDocument();
  });

  it("should filter remappings via the search input on the from/to/database fields", async () => {
    setup({
      remappings: [
        createMockTableRemapping({
          id: 1,
          database_id: 1,
          from_schema: "public",
          from_table_name: "orders",
          to_schema: "workspace",
          to_table_name: "orders_clean",
        }),
        createMockTableRemapping({
          id: 2,
          database_id: 2,
          from_schema: "raw",
          from_table_name: "events",
          to_schema: "workspace",
          to_table_name: "events_clean",
        }),
      ],
      databases: [
        createMockDatabase({ id: 1, name: "Sample DB" }),
        createMockDatabase({ id: 2, name: "Analytics DB" }),
      ],
    });

    await waitFor(() => {
      expect(getDataRows()).toHaveLength(2);
    });

    await searchFor("orders");
    await waitFor(() => {
      expect(queryCellByText(getTable(), "raw/events")).not.toBeInTheDocument();
    });
    expect(getCellByText(getTable(), "public/orders")).toBeInTheDocument();
    expect(getDataRows()).toHaveLength(1);

    await searchFor("Analytics");
    await waitFor(() => {
      expect(getCellByText(getTable(), "raw/events")).toBeInTheDocument();
    });
    expect(
      queryCellByText(getTable(), "public/orders"),
    ).not.toBeInTheDocument();
    expect(getDataRows()).toHaveLength(1);
  });

  it("should open the sidebar with table metadata when a remapping row is clicked", async () => {
    const ordersTable = createMockTable({
      id: 10,
      db_id: 1,
      schema: "public",
      name: "orders",
      display_name: "Orders",
      description: "All orders ever",
    });

    setup({
      remappings: [
        createMockTableRemapping({
          id: 1,
          from_table_id: 10,
          from_schema: "public",
          from_table_name: "orders",
          to_schema: "workspace",
          to_table_name: "orders_clean",
        }),
      ],
      databases: [createMockDatabase({ id: 1, name: "Sample DB" })],
      tables: [ordersTable],
    });

    await waitFor(() => {
      expect(getDataRows()).toHaveLength(1);
    });
    expect(screen.queryByTestId("remapping-sidebar")).not.toBeInTheDocument();

    await userEvent.click(getCellByText(getTable(), "public/orders"));

    const sidebar = await screen.findByTestId("remapping-sidebar");
    expect(within(sidebar).getByText("Orders")).toBeInTheDocument();

    const mappedTo = within(sidebar).getByRole("region", { name: "Mapped to" });
    expect(
      getCellByText(mappedTo, "workspace/orders_clean"),
    ).toBeInTheDocument();
  });

  it("should fall back to the remapping's from_table_name when the table id is missing", async () => {
    setup({
      remappings: [
        createMockTableRemapping({
          id: 1,
          from_table_id: null,
          from_table_name: "orphan_orders",
          to_table_name: "orphan_orders_clean",
        }),
      ],
      databases: [createMockDatabase({ id: 1, name: "Sample DB" })],
    });

    await waitFor(() => {
      expect(getDataRows()).toHaveLength(1);
    });
    await userEvent.click(getCellByText(getTable(), "public/orphan_orders"));

    const sidebar = await screen.findByTestId("remapping-sidebar");
    expect(within(sidebar).getByText("orphan_orders")).toBeInTheDocument();

    expect(
      fetchMock.callHistory.calls(/\/api\/table\/.*\/query_metadata/),
    ).toHaveLength(0);
  });

  it("should close the sidebar when the close button is clicked", async () => {
    const ordersTable = createMockTable({
      id: 10,
      db_id: 1,
      schema: "public",
      name: "orders",
      display_name: "Orders",
    });
    setup({
      remappings: [
        createMockTableRemapping({
          id: 1,
          from_table_id: 10,
          from_table_name: "orders",
        }),
      ],
      databases: [createMockDatabase({ id: 1, name: "Sample DB" })],
      tables: [ordersTable],
    });

    await waitFor(() => {
      expect(getDataRows()).toHaveLength(1);
    });
    await userEvent.click(getCellByText(getTable(), "public/orders"));

    const sidebar = await screen.findByTestId("remapping-sidebar");
    await userEvent.click(
      within(sidebar).getByRole("button", { name: /Close/i }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId("remapping-sidebar")).not.toBeInTheDocument();
    });
  });

  it("should hide the table when the remappings request fails", async () => {
    setup({ withRemappingsError: true });

    await waitForLoaderToBeRemoved();

    expect(screen.queryByTestId("remapping-table")).not.toBeInTheDocument();
  });

  it("should render both header tabs", async () => {
    setup();

    const overviewTab = await screen.findByRole("link", { name: /Overview/i });
    expect(overviewTab).toHaveAttribute(
      "href",
      Urls.workspaceInstanceOverview(),
    );
    expect(
      screen.getByRole("link", { name: /Table remappings/i }),
    ).toHaveAttribute("href", Urls.workspaceInstanceRemappings());
  });
});
