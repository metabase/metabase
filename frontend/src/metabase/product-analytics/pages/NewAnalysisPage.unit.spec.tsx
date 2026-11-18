import userEvent from "@testing-library/user-event";

import {
  setupTableQueryMetadataEndpointError,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { act, renderRoutes, screen, waitFor } from "__support__/ui";
import { toRouteObjects } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";
import {
  createMockField,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { getRoutes } from "../routes";

const createFields = (tableId: number) => [
  createMockField({
    id: tableId * 10 + 1,
    table_id: tableId,
    name: "created_at",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
  }),
  createMockField({
    id: tableId * 10 + 2,
    table_id: tableId,
    name: "user_id",
    base_type: "type/Text",
    effective_type: "type/Text",
  }),
];

const SET_UP_TABLE = createMockTable({
  id: 1,
  db_id: 1,
  schema: "public",
  name: "events",
  display_name: "Events",
  entity_type: "entity/EventTable",
  event_settings: {
    "columns.timestamp": "created_at",
    "columns.person": "user_id",
  },
  fields: createFields(1),
});

const UNFINISHED_TABLE = createMockTable({
  id: 2,
  db_id: 1,
  schema: "public",
  name: "orders",
  display_name: "Orders",
  entity_type: "entity/EventTable",
  event_settings: { "columns.timestamp": "created_at" },
  fields: createFields(2),
});

type SetupOpts = {
  initialRoute: string;
  isAdmin?: boolean;
  tables?: Table[];
};

const setup = ({
  initialRoute,
  isAdmin = false,
  tables = [SET_UP_TABLE, UNFINISHED_TABLE],
}: SetupOpts) => {
  setupTablesEndpoints(tables);
  const { router } = renderRoutes(toRouteObjects(getRoutes()), {
    initialRoute,
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
  return { router };
};

describe("NewAnalysisPage", () => {
  it("is not found for an unknown kind of analysis", async () => {
    setup({ initialRoute: "/product-analysis/new?kind=unknown" });

    expect(
      await screen.findByText("We're a little lost..."),
    ).toBeInTheDocument();
  });

  it("starts by picking a table, and keeps it in the URL", async () => {
    const { router } = setup({
      initialRoute: "/product-analysis/new?kind=habit",
    });

    expect(
      await screen.findByRole("heading", { name: "Habit analysis" }),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Events"));

    await waitFor(() =>
      expect(router?.location.search).toBe(
        `?kind=habit&table=${SET_UP_TABLE.id}`,
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Habit analysis on Events" }),
    ).toBeInTheDocument();
  });

  it("goes back to picking a table", async () => {
    const { router } = setup({
      initialRoute: "/product-analysis/new?kind=habit",
    });
    await userEvent.click(await screen.findByText("Events"));
    await screen.findByRole("heading", { name: "Habit analysis on Events" });

    act(() => router?.back());

    expect(router?.location.search).toBe("?kind=habit");
    expect(
      await screen.findByRole("heading", { name: "Habit analysis" }),
    ).toBeInTheDocument();
  });

  it("starts over when it's opened again without a table", async () => {
    const { router } = setup({
      initialRoute: "/product-analysis/new?kind=habit",
    });
    await userEvent.type(
      await screen.findByPlaceholderText("Search for tables…"),
      "page",
    );
    await userEvent.click(
      screen.getByRole("heading", { name: "Habit analysis" }),
    );
    expect(
      screen.queryByPlaceholderText("Search for tables…"),
    ).not.toBeInTheDocument();

    act(() => router?.navigate("/product-analysis/new?kind=habit"));

    expect(
      await screen.findByPlaceholderText("Search for tables…"),
    ).toHaveValue("");
  });

  it("opens on the table in the URL", async () => {
    setup({
      initialRoute: `/product-analysis/new?kind=habit&table=${SET_UP_TABLE.id}`,
    });

    expect(
      await screen.findByRole("heading", { name: "Habit analysis on Events" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/isn't set up/)).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search for tables…"),
    ).not.toBeInTheDocument();
  });

  it("links someone who can set up a table to its Events tab", async () => {
    setup({
      initialRoute: `/product-analysis/new?kind=habit&table=${UNFINISHED_TABLE.id}`,
      isAdmin: true,
    });

    expect(
      await screen.findByText(
        "This table isn't set up for product analysis yet",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up in Data Studio" }),
    ).toHaveAttribute(
      "href",
      Urls.dataStudioData({
        databaseId: UNFINISHED_TABLE.db_id,
        schemaName: UNFINISHED_TABLE.schema,
        tableId: UNFINISHED_TABLE.id,
        tab: "events",
      }),
    );
  });

  it("shows an error when the table can't be loaded", async () => {
    setupTableQueryMetadataEndpointError(999, "Table not found");
    setup({ initialRoute: "/product-analysis/new?kind=habit&table=999" });

    expect(await screen.findByText("Table not found")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Pick a table/ }),
    ).toBeInTheDocument();
  });

  it("asks an admin who can't edit the table to ask another admin", async () => {
    setup({
      initialRoute: `/product-analysis/new?kind=habit&table=${UNFINISHED_TABLE.id}`,
      isAdmin: true,
      tables: [SET_UP_TABLE, { ...UNFINISHED_TABLE, can_write: false }],
    });

    expect(
      await screen.findByText(
        "Ask an admin to set up this table in Data Studio.",
      ),
    ).toBeInTheDocument();
  });

  it("tells anyone else to ask an admin to set up a table", async () => {
    setup({
      initialRoute: `/product-analysis/new?kind=habit&table=${UNFINISHED_TABLE.id}`,
    });

    expect(
      await screen.findByText(
        "Ask an admin to set up this table in Data Studio.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Set up in Data Studio" }),
    ).not.toBeInTheDocument();
  });
});
