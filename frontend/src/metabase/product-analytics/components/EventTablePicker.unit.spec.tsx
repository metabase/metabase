import userEvent from "@testing-library/user-event";

import { setupTablesEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { Table } from "metabase-types/api";
import { createMockTable, createMockUser } from "metabase-types/api/mocks";

import { EventTablePicker } from "./EventTablePicker";

const DETECTED_ROLES = {
  schema: "snowplow",
  settings: {
    "columns.timestamp": "derived_tstamp",
    "columns.person": "domain_userid",
  },
};

const SET_UP_TABLE = createMockTable({
  id: 1,
  name: "events",
  display_name: "Events",
  entity_type: "entity/EventTable",
  detected_event_settings: DETECTED_ROLES,
});

const OTHER_SET_UP_TABLE = createMockTable({
  id: 2,
  name: "page_views",
  display_name: "Page views",
  entity_type: "entity/EventTable",
  detected_event_settings: DETECTED_ROLES,
});

const UNFINISHED_TABLE = createMockTable({
  id: 3,
  name: "ga4_events",
  display_name: "GA4 events",
  entity_type: "entity/EventTable",
  detected_event_settings: {
    schema: "ga4",
    settings: { "columns.person": "user_pseudo_id" },
  },
});

type SetupOpts = {
  tables?: Table[];
  isAdmin?: boolean;
};

const setup = ({
  tables = [SET_UP_TABLE, OTHER_SET_UP_TABLE, UNFINISHED_TABLE],
  isAdmin = false,
}: SetupOpts = {}) => {
  setupTablesEndpoints(tables);
  renderWithProviders(
    <EventTablePicker
      tableId={undefined}
      isInitiallyOpened
      onChange={jest.fn<void, [number]>()}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );
};

describe("EventTablePicker", () => {
  it("offers only the tables that are set up", async () => {
    setup();

    expect(await screen.findByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Page views")).toBeInTheDocument();
    expect(screen.queryByText("GA4 events")).not.toBeInTheDocument();
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

  it("tells anyone else to ask an admin when no table is set up", async () => {
    setup({ tables: [UNFINISHED_TABLE] });

    expect(
      await screen.findByText(
        "No tables are set up for product analysis yet. Ask an admin to set one up in Data Studio.",
      ),
    ).toBeInTheDocument();
  });
});
