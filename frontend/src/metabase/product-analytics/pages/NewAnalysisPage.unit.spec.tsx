import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupAdhocQueryEndpoint,
  setupTableEndpoints,
  setupTableQueryMetadataEndpointError,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { act, renderRoutes, screen, waitFor, within } from "__support__/ui";
import { toRouteObjects } from "metabase/router";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type { Field, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockDataset,
  createMockField,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  getQueryEventDefinition,
  readEventDefinition,
  toJsEventDefinition,
} from "../event-definition";
import { getRoutes } from "../routes";
import { decodeSettings, encodeSettings } from "../url-state";

registerVisualizations();

const PEOPLE_ID_FIELD = createMockField({
  id: 31,
  table_id: 3,
  name: "id",
  display_name: "ID",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/PK",
});

const PEOPLE_TABLE = createMockTable({
  id: 3,
  db_id: 1,
  schema: "public",
  name: "people",
  display_name: "People",
  fields: [
    PEOPLE_ID_FIELD,
    createMockField({
      id: 32,
      table_id: 3,
      name: "plan",
      display_name: "Plan",
      base_type: "type/Text",
      effective_type: "type/Text",
    }),
  ],
});

const createFields = (tableId: number, userIdOpts?: Partial<Field>) => [
  createMockField({
    id: tableId * 10 + 1,
    table_id: tableId,
    name: "created_at",
    display_name: "Created At",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
  }),
  createMockField({
    id: tableId * 10 + 2,
    table_id: tableId,
    name: "user_id",
    display_name: "User ID",
    base_type: "type/Text",
    effective_type: "type/Text",
    ...userIdOpts,
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
  fields: createFields(1, {
    semantic_type: "type/FK",
    fk_target_field_id: PEOPLE_ID_FIELD.id,
    target: PEOPLE_ID_FIELD,
  }),
});

const PAGE_VIEWS_TABLE = createMockTable({
  id: 4,
  db_id: 1,
  schema: "public",
  name: "page_views",
  display_name: "Page views",
  entity_type: "entity/EventTable",
  event_settings: {
    "columns.timestamp": "created_at",
    "columns.person": "user_id",
  },
  fields: createFields(4),
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

const USER_ID_FIELD_ID = checkNotNull(
  SET_UP_TABLE.fields?.find((field) => field.name === "user_id"),
).id;

const getUserQuery = (filterValues: string[]) => {
  const metadataProvider = createMetadataProvider({
    databaseId: SET_UP_TABLE.db_id,
    metadata: createMockMetadata({
      databases: [
        createMockDatabase({ id: SET_UP_TABLE.db_id, tables: [SET_UP_TABLE] }),
      ],
    }),
  });
  return Lib.createTestQuery(metadataProvider, {
    stages: [
      {
        source: { type: "table", id: SET_UP_TABLE.id },
        filters: filterValues.map((value) => ({
          type: "operator",
          operator: "=",
          args: [
            { type: "column", name: "user_id" },
            { type: "literal", value },
          ],
        })),
      },
    ],
  });
};

const getBaseQuery = (filterValues: string[]) =>
  Lib.toJsQuery(getUserQuery(filterValues));

const getStoredSettings = (router: ReturnType<typeof setup>["router"]) =>
  decodeSettings(router?.location.hash.replace(/^#/, "") ?? "");

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
  setupTableEndpoints(PEOPLE_TABLE);
  setupAdhocQueryEndpoint(createMockDataset());
  const { router } = renderRoutes(toRouteObjects(getRoutes()), {
    initialRoute,
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
  return { router };
};

const SET_UP_TABLE_ROUTE = `/product-analysis/new?kind=habit&table=${SET_UP_TABLE.id}`;

const getRunRequests = () => fetchMock.callHistory.calls("path:/api/dataset");

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

  it("starts another table with the default settings", async () => {
    const { router } = setup({
      initialRoute: `${SET_UP_TABLE_ROUTE}#${encodeSettings({ granularity: "week" })}`,
      tables: [SET_UP_TABLE, PAGE_VIEWS_TABLE],
    });
    expect(
      await screen.findByRole("button", { name: "by week" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Events/ }));
    await userEvent.click(await screen.findByText("Page views"));

    expect(
      await screen.findByRole("heading", {
        name: "Habit analysis on Page views",
      }),
    ).toBeInTheDocument();
    expect(router?.location.search).toBe(
      `?kind=habit&table=${PAGE_VIEWS_TABLE.id}`,
    );
    expect(router?.location.hash).toBe("");
    expect(
      await screen.findByRole("button", { name: "by day" }),
    ).toBeInTheDocument();
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

  describe("toolbar", () => {
    it("shows the default settings", async () => {
      setup({ initialRoute: SET_UP_TABLE_ROUTE });

      expect(
        await screen.findByRole("button", { name: /Previous 90 days/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "by day" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Count people")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Count people/ }),
      ).not.toBeInTheDocument();
    });

    it("reruns the analysis with a changed setting, and keeps it in the URL", async () => {
      const { router } = setup({ initialRoute: SET_UP_TABLE_ROUTE });
      expect(
        await screen.findByRole("heading", {
          name: "How many days did people show up?",
        }),
      ).toBeInTheDocument();
      await waitFor(() => expect(getRunRequests()).toHaveLength(1));

      await userEvent.click(screen.getByRole("button", { name: "by day" }));
      await userEvent.click(
        await screen.findByRole("option", { name: "Week" }),
      );

      expect(
        await screen.findByRole("heading", {
          name: "How many weeks did people show up?",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "by week" }),
      ).toBeInTheDocument();
      await waitFor(() => expect(getRunRequests()).toHaveLength(2));
      expect(router?.location.search).toBe(
        `?kind=habit&table=${SET_UP_TABLE.id}`,
      );
      expect(router?.location.hash).toBe(
        `#${encodeSettings({ granularity: "week" })}`,
      );
    });

    it("reruns the analysis with a changed date range, and keeps it in the URL", async () => {
      const { router } = setup({ initialRoute: SET_UP_TABLE_ROUTE });
      await waitFor(() => expect(getRunRequests()).toHaveLength(1));

      await userEvent.click(
        await screen.findByRole("button", { name: /Previous 90 days/ }),
      );
      const interval = await screen.findByLabelText("Interval");
      await userEvent.clear(interval);
      await userEvent.type(interval, "30");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));

      expect(
        await screen.findByRole("button", { name: /Previous 30 days/ }),
      ).toBeInTheDocument();
      expect(router?.location.hash).toBe(
        `#${encodeSettings({ date_range: "past30days" })}`,
      );
      await waitFor(() => expect(getRunRequests()).toHaveLength(2));
    });

    it("offers no date filter that can't be stored", async () => {
      setup({ initialRoute: SET_UP_TABLE_ROUTE });

      await userEvent.click(
        await screen.findByRole("button", { name: /Previous 90 days/ }),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Back" }),
      );
      await userEvent.click(await screen.findByText("Exclude…"));

      expect(await screen.findByText("Days of the week…")).toBeInTheDocument();
      expect(screen.queryByText("Empty values")).not.toBeInTheDocument();
      expect(screen.queryByText("Not empty values")).not.toBeInTheDocument();
    });

    it("opens with the settings in the URL", async () => {
      setup({
        initialRoute: `${SET_UP_TABLE_ROUTE}#${encodeSettings({ granularity: "week" })}`,
      });

      expect(
        await screen.findByRole("button", { name: "by week" }),
      ).toBeInTheDocument();
    });

    it("opens with the default settings when the URL's are broken", async () => {
      setup({ initialRoute: `${SET_UP_TABLE_ROUTE}#not-settings` });

      expect(
        await screen.findByRole("button", { name: "by day" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("adds the first filter from the Filters button, and then shows the filters", async () => {
      setup({ initialRoute: SET_UP_TABLE_ROUTE });
      const filtersButton = await screen.findByRole("button", {
        name: "Filters",
      });
      await waitFor(() => expect(filtersButton).toBeEnabled());
      expect(screen.queryByTestId("filters-count")).not.toBeInTheDocument();

      await userEvent.click(filtersButton);
      await userEvent.click(await screen.findByText("Created At"));
      await userEvent.click(await screen.findByText("Today"));

      expect(
        await screen.findByRole("button", { name: "1 filter" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        within(screen.getByTestId("analysis-filters"))
          .getAllByTestId("filter-pill")
          .map((pill) => pill.textContent),
      ).toEqual(["Created At is today"]);
    });

    it("hides the filters when the last one is removed", async () => {
      setup({
        initialRoute: `${SET_UP_TABLE_ROUTE}#${encodeSettings({ base_query: getBaseQuery(["u1"]) })}`,
      });
      await userEvent.click(
        await screen.findByRole("button", { name: "1 filter" }),
      );

      await userEvent.click(
        within(screen.getByTestId("filter-pill")).getByLabelText("Remove"),
      );

      expect(
        await screen.findByRole("button", { name: "Filters" }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("analysis-filters")).not.toBeInTheDocument();
    });

    it("offers the columns of a table the event table links to", async () => {
      setup({ initialRoute: SET_UP_TABLE_ROUTE });
      const filtersButton = await screen.findByRole("button", {
        name: "Filters",
      });
      await waitFor(() => expect(filtersButton).toBeEnabled());

      await userEvent.click(filtersButton);

      await userEvent.click(await screen.findByText("User"));

      expect(await screen.findByText("Plan")).toBeInTheDocument();
    });

    it("counts the filters in the URL, and shows them on the Filters button", async () => {
      setup({
        initialRoute: `${SET_UP_TABLE_ROUTE}#${encodeSettings({ base_query: getBaseQuery(["u1", "u2"]) })}`,
      });

      expect(await screen.findByTestId("filters-count")).toHaveTextContent("2");
      expect(screen.queryByTestId("analysis-filters")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "2 filters" }));

      expect(
        within(screen.getByTestId("analysis-filters"))
          .getAllByTestId("filter-pill")
          .map((pill) => pill.textContent),
      ).toEqual(["User ID is u1", "User ID is u2"]);

      await userEvent.click(screen.getByRole("button", { name: "2 filters" }));

      expect(screen.queryByTestId("analysis-filters")).not.toBeInTheDocument();
    });

    it("reruns the analysis without a removed filter, and keeps it in the URL", async () => {
      const { router } = setup({
        initialRoute: `${SET_UP_TABLE_ROUTE}#${encodeSettings({ base_query: getBaseQuery(["u1", "u2"]) })}`,
      });
      await waitFor(() => expect(getRunRequests()).toHaveLength(1));
      await userEvent.click(
        await screen.findByRole("button", { name: "2 filters" }),
      );

      const [firstPill] = screen.getAllByTestId("filter-pill");
      await userEvent.click(within(firstPill).getByLabelText("Remove"));

      await waitFor(() => expect(getRunRequests()).toHaveLength(2));
      // The remaining filter, then the date range's.
      expect(await getRunRequests()[1].request?.json()).toMatchObject({
        stages: [
          {
            filters: [
              ["=", {}, ["field", {}, USER_ID_FIELD_ID], "u2"],
              expect.anything(),
            ],
          },
          {},
        ],
      });
      expect(
        screen.getByRole("button", { name: "1 filter" }),
      ).toBeInTheDocument();
      expect(
        screen.getAllByTestId("filter-pill").map((pill) => pill.textContent),
      ).toEqual(["User ID is u2"]);
      expect(getStoredSettings(router)).toMatchObject({
        base_query: {
          stages: [
            { filters: [["=", {}, ["field", {}, USER_ID_FIELD_ID], "u2"]] },
          ],
        },
      });
    });

    it("undoes a change with browser back, and redoes it with forward", async () => {
      const { router } = setup({ initialRoute: SET_UP_TABLE_ROUTE });
      await userEvent.click(
        await screen.findByRole("button", { name: "by day" }),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "Week" }),
      );
      expect(
        await screen.findByRole("button", { name: "by week" }),
      ).toBeInTheDocument();

      act(() => router?.back());
      expect(
        await screen.findByRole("button", { name: "by day" }),
      ).toBeInTheDocument();

      act(() => router?.forward());
      expect(
        await screen.findByRole("button", { name: "by week" }),
      ).toBeInTheDocument();
    });
  });

  describe("drill", () => {
    const DRILL: Lib.AnalysisDrill = {
      type: "actors",
      dimensions: [{ column: "periods", value: 6 }],
    };
    const DRILL_LABEL = "People active on 6 days";
    const DRILLED_ROUTE = `${SET_UP_TABLE_ROUTE}#${encodeSettings({ drill: DRILL })}`;

    it("runs a query for the drilled cell's people, and names the cell in the toolbar", async () => {
      setup({ initialRoute: DRILLED_ROUTE });

      expect(await screen.findByText(DRILL_LABEL)).toBeInTheDocument();
      await waitFor(() => expect(getRunRequests()).toHaveLength(1));
      const query: unknown = await getRunRequests()[0].request?.json();
      expect(query).toMatchObject({
        stages: [{}, { filters: [["=", {}, ["field", {}, "periods"], 6]] }],
      });
      expect(query).not.toMatchObject({
        stages: [{}, { aggregation: expect.anything() }],
      });
    });

    it("goes back to the result when the drill is removed", async () => {
      const { router } = setup({ initialRoute: DRILLED_ROUTE });
      await waitFor(() => expect(getRunRequests()).toHaveLength(1));

      await userEvent.click(
        await screen.findByRole("button", { name: `Remove ${DRILL_LABEL}` }),
      );

      expect(screen.queryByText(DRILL_LABEL)).not.toBeInTheDocument();
      expect(getStoredSettings(router)).toEqual({ drill: null });
      await waitFor(() => expect(getRunRequests()).toHaveLength(2));
      expect(await getRunRequests()[1].request?.json()).toMatchObject({
        stages: [{}, { aggregation: [expect.anything()] }],
      });
    });

    it("is cleared by a change to another setting, and comes back with browser back", async () => {
      const { router } = setup({ initialRoute: DRILLED_ROUTE });
      await userEvent.click(
        await screen.findByRole("button", { name: "by day" }),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "Week" }),
      );

      expect(
        await screen.findByRole("button", { name: "by week" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(DRILL_LABEL)).not.toBeInTheDocument();
      expect(getStoredSettings(router)).toEqual({
        drill: null,
        granularity: "week",
      });

      act(() => router?.back());
      expect(await screen.findByText(DRILL_LABEL)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "by day" }),
      ).toBeInTheDocument();
    });
  });

  describe("setup panel", () => {
    const ACTIVE_EVENT_TITLE = "What event counts as showing up?";

    const getActiveEvent = () =>
      screen.getByRole("group", { name: ACTIVE_EVENT_TITLE });

    it("opens with the setup panel, where any event counts as showing up", async () => {
      setup({ initialRoute: SET_UP_TABLE_ROUTE });

      const panel = await screen.findByRole("region", { name: "Setup" });
      expect(
        within(panel).getByRole("heading", { name: "Setup" }),
      ).toBeInTheDocument();
      expect(within(panel).queryByRole("tab")).not.toBeInTheDocument();
      expect(
        within(getActiveEvent()).getByText("Any event"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Setup" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("reruns the analysis with an active event, and keeps it in the URL", async () => {
      const { router } = setup({ initialRoute: SET_UP_TABLE_ROUTE });
      await waitFor(() => expect(getRunRequests()).toHaveLength(1));

      await userEvent.click(
        within(await screen.findByRole("region", { name: "Setup" })).getByText(
          "Any event",
        ),
      );
      await userEvent.click(await screen.findByText("Created At"));
      await userEvent.click(await screen.findByText("Today"));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(
        within(getActiveEvent()).getByText("Created At is today"),
      ).toBeInTheDocument();
      await waitFor(() => expect(getRunRequests()).toHaveLength(2));
      const event = readEventDefinition(
        getStoredSettings(router)["habit.active"],
      );
      expect(event?.name).toBeNull();
      expect(event?.conditions).toHaveLength(1);
    });

    it("opens with the active event in the URL, and removes it", async () => {
      const activeEvent = toJsEventDefinition(
        getQueryEventDefinition(getUserQuery(["u1"]), "Signed up"),
      );
      const { router } = setup({
        initialRoute: `${SET_UP_TABLE_ROUTE}#${encodeSettings({ "habit.active": activeEvent })}`,
      });
      await screen.findByRole("region", { name: "Setup" });
      await waitFor(() => expect(getRunRequests()).toHaveLength(1));
      expect(
        within(getActiveEvent()).getByText("Signed up"),
      ).toBeInTheDocument();

      await userEvent.click(
        within(getActiveEvent()).getByRole("button", { name: "Remove" }),
      );

      expect(
        within(getActiveEvent()).getByText("Any event"),
      ).toBeInTheDocument();
      expect(getStoredSettings(router)["habit.active"]).toBeNull();
      await waitFor(() => expect(getRunRequests()).toHaveLength(2));
    });

    it("reruns the analysis with percent values, and keeps them in the URL", async () => {
      const { router } = setup({ initialRoute: SET_UP_TABLE_ROUTE });
      await waitFor(() => expect(getRunRequests()).toHaveLength(1));
      const values = await screen.findByRole("radiogroup", {
        name: "What value do you want to see?",
      });
      expect(
        within(values).getByRole("radio", { name: "People" }),
      ).toBeChecked();

      await userEvent.click(
        within(values).getByRole("radio", { name: "Percent of total" }),
      );

      expect(
        within(values).getByRole("radio", { name: "Percent of total" }),
      ).toBeChecked();
      expect(getStoredSettings(router)["habit.values"]).toBe("percent");
      await waitFor(() => expect(getRunRequests()).toHaveLength(2));
    });

    it("closes, and reopens from the toolbar", async () => {
      setup({ initialRoute: SET_UP_TABLE_ROUTE });
      const panel = await screen.findByRole("region", { name: "Setup" });

      await userEvent.click(
        within(panel).getByRole("button", { name: "Close" }),
      );
      expect(
        screen.queryByRole("region", { name: "Setup" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Setup" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );

      await userEvent.click(screen.getByRole("button", { name: "Setup" }));
      expect(screen.getByRole("region", { name: "Setup" })).toBeInTheDocument();
    });

    it("resizes between 240 and 640 pixels from its right edge", async () => {
      // jsdom doesn't implement pointer capture.
      Element.prototype.setPointerCapture = jest.fn<void, [number]>();
      Element.prototype.releasePointerCapture = jest.fn<void, [number]>();
      setup({ initialRoute: SET_UP_TABLE_ROUTE });
      const panel = await screen.findByRole("region", { name: "Setup" });
      const handle = within(panel).getByRole("separator");
      const drag = (toX: number) =>
        userEvent.pointer([
          {
            keys: "[MouseLeft>]",
            target: handle,
            coords: { x: 0, clientX: 0 },
          },
          { target: handle, coords: { x: toX, clientX: toX } },
          { keys: "[/MouseLeft]", target: handle },
        ]);

      await drag(100);
      expect(panel).toHaveStyle({ width: "460px" });
      await drag(1000);
      expect(panel).toHaveStyle({ width: "640px" });
      await drag(-1000);
      expect(panel).toHaveStyle({ width: "240px" });
    });

    it("isn't there without a table", async () => {
      setup({ initialRoute: "/product-analysis/new?kind=habit" });

      expect(
        await screen.findByRole("button", { name: "Setup" }),
      ).toBeDisabled();
      expect(
        screen.queryByRole("region", { name: "Setup" }),
      ).not.toBeInTheDocument();
    });
  });
});
