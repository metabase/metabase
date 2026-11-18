import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { Table, TableId } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { EventTablePicker } from "./EventTablePicker";

const SET_UP_SETTINGS = {
  "columns.timestamp": "created_at",
  "columns.person": "user_id",
};

const SET_UP_TABLE = createMockTable({
  id: 1,
  name: "events",
  display_name: "Events",
  entity_type: "entity/EventTable",
  event_settings: SET_UP_SETTINGS,
});

const OTHER_SET_UP_TABLE = createMockTable({
  id: 2,
  name: "page_views",
  display_name: "Page views",
  entity_type: "entity/EventTable",
  event_settings: SET_UP_SETTINGS,
});

const UNFINISHED_TABLE = createMockTable({
  id: 3,
  name: "ga4_events",
  display_name: "GA4 events",
  entity_type: "entity/EventTable",
  event_settings: { "columns.person": "user_pseudo_id" },
});

type SetupOpts = {
  tables?: Table[];
  table?: Table;
  isAdmin?: boolean;
  hasListError?: boolean;
};

const setup = ({
  tables = [SET_UP_TABLE, OTHER_SET_UP_TABLE, UNFINISHED_TABLE],
  table,
  isAdmin = false,
  hasListError = false,
}: SetupOpts = {}) => {
  if (hasListError) {
    fetchMock.get("path:/api/table", 500);
  } else {
    setupTablesEndpoints(tables);
  }
  const onChange = jest.fn<void, [TableId]>();
  renderWithProviders(
    <EventTablePicker
      table={table}
      isLoading={false}
      isInitiallyOpened={table === undefined}
      onChange={onChange}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );
  return { onChange };
};

describe("EventTablePicker", () => {
  it("offers only the tables that are set up", async () => {
    setup();

    expect(await screen.findByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Page views")).toBeInTheDocument();
    expect(screen.queryByText("GA4 events")).not.toBeInTheDocument();
  });

  it("picks a table", async () => {
    const { onChange } = setup();

    await userEvent.click(await screen.findByText("Page views"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(OTHER_SET_UP_TABLE.id);
    expect(screen.queryByText("Events")).not.toBeInTheDocument();
  });

  it("shows the picked table, closed", async () => {
    setup({ table: SET_UP_TABLE });

    expect(
      await screen.findByRole("button", { name: /Events/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Page views")).not.toBeInTheDocument();
  });

  it("searches the set up tables", async () => {
    setup();
    await screen.findByText("Events");

    await userEvent.type(
      screen.getByPlaceholderText("Search for tables…"),
      "page",
    );

    expect(screen.getByText("Page views")).toBeInTheDocument();
    expect(screen.queryByText("Events")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText("Search for tables…"));
    await userEvent.type(
      screen.getByPlaceholderText("Search for tables…"),
      "ga4",
    );

    expect(
      screen.getByText("No event tables match your search."),
    ).toBeInTheDocument();
  });

  it("points an admin to Browse all when no table is set up", async () => {
    setup({ tables: [UNFINISHED_TABLE], isAdmin: true });

    expect(
      await screen.findByText(
        "No tables are set up for product analysis yet. Browse all tables to pick one to set up.",
      ),
    ).toBeInTheDocument();
  });

  it("says when the event tables can't be loaded", async () => {
    setup({ hasListError: true });

    expect(
      await screen.findByText("Couldn't load the event tables."),
    ).toBeInTheDocument();
  });

  it("opens the data picker from Browse all", async () => {
    mockGetBoundingClientRect();
    setupDatabasesEndpoints([createMockDatabase()]);
    setupCollectionByIdEndpoint({ collections: [] });
    setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
    setupSearchEndpoints([]);
    setup();

    await userEvent.click(await screen.findByText("Browse all"));

    expect(
      await screen.findByRole("dialog", { name: "Pick a table" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search for tables…"),
    ).not.toBeInTheDocument();
  });

  it("tells anyone else to ask an admin when no table is set up", async () => {
    setup({ tables: [UNFINISHED_TABLE] });

    expect(
      await screen.findByText(
        "No tables are set up for product analysis yet. Ask an admin to set one up in Data Studio.",
      ),
    ).toBeInTheDocument();
  });
});
