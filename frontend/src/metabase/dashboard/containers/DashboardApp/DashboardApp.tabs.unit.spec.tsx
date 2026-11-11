import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Dashboard, DashboardCard, Parameter } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
  createMockDataset,
  createMockParameter,
  createMockParameterMapping,
  createMockVirtualCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  PEOPLE,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

registerVisualizations();
registerDashboardVisualizations();

const DASHBOARD_ID = 1;

const TAB_1 = createMockDashboardTab({
  id: 1,
  dashboard_id: DASHBOARD_ID,
  name: "Tab 1",
});
const TAB_2 = createMockDashboardTab({
  id: 2,
  dashboard_id: DASHBOARD_ID,
  name: "Tab 2",
});

const DATE_FILTER = createMockParameter({
  id: "1",
  name: "Date filter",
  slug: "filter-date",
  type: "date/month-year",
});
const NUMBER_FILTER = createMockParameter({
  id: "2",
  name: "Number filter",
  slug: "filter-number",
  type: "number/=",
  default: 20,
});
const TEXT_FILTER = createMockParameter({
  id: "3",
  name: "Text filter",
  slug: "filter-text",
  type: "string/contains",
  default: "fa",
});
const LOCATION_FILTER = createMockParameter({
  id: "4",
  name: "Location filter",
  slug: "filter-location",
  type: "string/=",
});

const ORDERS_CARD = createMockCard({ id: 1, name: "Orders" });
const ORDERS_BY_YEAR_CARD = createMockCard({
  id: 2,
  name: "Orders, Count, Grouped by Created At (year)",
});

const HEADING_CARD = createMockVirtualCard({ display: "heading" });

type SetupOpts = {
  dashboard: Partial<Dashboard>;
};

async function setup({ dashboard: dashboardOpts }: SetupOpts) {
  const dashboard = createMockDashboard({ id: DASHBOARD_ID, ...dashboardOpts });
  const database = createSampleDatabase();

  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([database]);
  setupDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [database] }),
  );
  dashboard.dashcards.forEach((dashcard) => {
    if (dashcard.card_id != null) {
      setupDashcardQueryEndpoints(dashboard.id, dashcard, createMockDataset());
    }
  });
  setupCollectionsEndpoints({ collections: [] });
  setupSearchEndpoints([]);
  setupCardsEndpoints([ORDERS_CARD, ORDERS_BY_YEAR_CARD]);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  const { router } = renderWithProviders(
    <Route path="/dashboard/:slug" element={<DashboardApp />} />,
    {
      initialRoute: `/dashboard/${dashboard.id}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [database] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );

  await waitForDashboardToLoad();

  return { router: checkNotNull(router) };
}

function getFilterNames({ isEditing }: { isEditing: boolean }) {
  const containerTestId = isEditing
    ? "edit-dashboard-parameters-widget-container"
    : "dashboard-parameters-widget-container";
  const widgetTestId = isEditing
    ? "editing-parameter-widget"
    : "parameter-widget";
  return within(screen.getByTestId(containerTestId))
    .getAllByTestId(widgetTestId)
    .map((widget) => checkNotNull(widget.textContent));
}

function startsWithName({ name }: Parameter) {
  return expect.stringMatching(new RegExp(`^${name}`));
}

async function startEditing() {
  await userEvent.click(screen.getByLabelText("Edit dashboard"));
}

async function cancelEditing() {
  await userEvent.click(
    within(screen.getByTestId("edit-bar")).getByRole("button", {
      name: "Cancel",
    }),
  );
}

async function getSavedDashcards() {
  const call = await waitFor(() =>
    checkNotNull(
      fetchMock.callHistory.lastCall(`path:/api/dashboard/${DASHBOARD_ID}`, {
        method: "PUT",
      }),
    ),
  );
  const body: unknown = JSON.parse(String(call.options.body));
  return body != null && typeof body === "object" && "dashcards" in body
    ? body.dashcards
    : undefined;
}

describe("DashboardApp > tabs", () => {
  it("should only display filters mapped to cards on the selected tab", async () => {
    const dashcards: DashboardCard[] = [
      createMockDashboardCard({
        id: 1,
        dashboard_id: DASHBOARD_ID,
        dashboard_tab_id: TAB_1.id,
        card_id: ORDERS_CARD.id,
        card: ORDERS_CARD,
        size_x: 10,
        size_y: 4,
        parameter_mappings: [
          createMockParameterMapping({
            parameter_id: DATE_FILTER.id,
            card_id: ORDERS_CARD.id,
            target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
          }),
          // the mapping targets another card, but it still counts as mapped
          createMockParameterMapping({
            parameter_id: TEXT_FILTER.id,
            card_id: ORDERS_BY_YEAR_CARD.id,
            target: [
              "dimension",
              ["field", PEOPLE.NAME, { "source-field": ORDERS.USER_ID }],
            ],
          }),
        ],
      }),
      createMockDashboardCard({
        id: 2,
        dashboard_id: DASHBOARD_ID,
        dashboard_tab_id: TAB_2.id,
        card_id: ORDERS_BY_YEAR_CARD.id,
        card: ORDERS_BY_YEAR_CARD,
        size_x: 10,
        size_y: 4,
        parameter_mappings: [
          createMockParameterMapping({
            parameter_id: DATE_FILTER.id,
            card_id: ORDERS_BY_YEAR_CARD.id,
            target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
          }),
          createMockParameterMapping({
            parameter_id: NUMBER_FILTER.id,
            card_id: ORDERS_BY_YEAR_CARD.id,
            target: ["dimension", ["field", ORDERS.QUANTITY, null]],
          }),
        ],
      }),
    ];
    const { router } = await setup({
      dashboard: {
        tabs: [TAB_1, TAB_2],
        parameters: [DATE_FILTER, NUMBER_FILTER, TEXT_FILTER, LOCATION_FILTER],
        dashcards,
      },
    });
    const allFilters = [
      DATE_FILTER,
      NUMBER_FILTER,
      TEXT_FILTER,
      LOCATION_FILTER,
    ].map(startsWithName);
    const expectFilterValuesInUrl = () =>
      waitFor(() => {
        const searchParams = new URLSearchParams(router.location.search);
        expect(Object.fromEntries(searchParams)).toMatchObject({
          "filter-date": "",
          "filter-number": "20",
          "filter-text": "fa",
          "filter-location": "",
        });
      });

    expect(getFilterNames({ isEditing: false })).toEqual([
      startsWithName(DATE_FILTER),
      startsWithName(TEXT_FILTER),
    ]);
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(
      screen.queryByText(ORDERS_BY_YEAR_CARD.name),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId("dashcard")).toHaveLength(1);
    await expectFilterValuesInUrl();

    await startEditing();
    expect(getFilterNames({ isEditing: true })).toEqual(allFilters);
    await cancelEditing();

    await userEvent.click(screen.getByRole("tab", { name: TAB_2.name }));

    expect(getFilterNames({ isEditing: false })).toEqual([
      startsWithName(DATE_FILTER),
      startsWithName(NUMBER_FILTER),
    ]);
    await expectFilterValuesInUrl();

    await startEditing();
    expect(getFilterNames({ isEditing: true })).toEqual(allFilters);
  });

  it("should keep showing the dashcards after canceling the creation of a new tab (#38055, #38278)", async () => {
    await setup({
      dashboard: {
        dashcards: [
          createMockVirtualDashCard({
            id: 1,
            dashboard_id: DASHBOARD_ID,
            card: HEADING_CARD,
            visualization_settings: {
              text: "Existing heading",
              virtual_card: HEADING_CARD,
            },
          }),
        ],
      },
    });

    await startEditing();
    await userEvent.click(screen.getByLabelText("Create new tab"));
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    await cancelEditing();
    await userEvent.click(
      await screen.findByRole("button", { name: "Discard changes" }),
    );

    await waitFor(() =>
      expect(screen.queryByTestId("edit-bar")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText(/There's nothing here/)).not.toBeInTheDocument();
    expect(await screen.findByText("Existing heading")).toBeInTheDocument();
    expect(screen.getAllByTestId("dashcard")).toHaveLength(1);

    await startEditing();
    await userEvent.click(screen.getByLabelText("Add a heading or text box"));
    await userEvent.click(await screen.findByText("Heading"));
    await userEvent.type(
      screen.getByPlaceholderText(
        "You can connect widgets to {{variables}} in heading cards.",
      ),
      "New heading",
    );
    await userEvent.click(screen.getByTestId("save-edit-button"));

    expect(await getSavedDashcards()).toEqual([
      expect.objectContaining({ id: 1, dashboard_tab_id: null }),
      expect.objectContaining({ dashboard_tab_id: null }),
    ]);
    await waitFor(() =>
      expect(screen.queryByTestId("edit-bar")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("dashcard")).toHaveLength(2);
  });
});
