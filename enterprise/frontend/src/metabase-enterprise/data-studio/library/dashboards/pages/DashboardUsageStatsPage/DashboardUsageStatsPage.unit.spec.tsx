import fetchMock from "fetch-mock";

import {
  setupAuditInfoEndpoint,
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { setupListSubscriptionsEndpoint } from "__support__/server-mocks/pulse";
import { renderWithProviders, screen, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { DashboardCard, RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockParameter,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { DashboardUsageStatsPage } from "./DashboardUsageStatsPage";
import { USAGE_STATS_CARD_ENTITY_IDS } from "./constants";

jest.mock("metabase/visualizations/components/Visualization", () => {
  const StubVisualization = ({ rawSeries }: { rawSeries?: RawSeries }) => (
    <div data-testid="visualization">{rawSeries?.[0]?.card.display}</div>
  );
  return { __esModule: true, default: StubVisualization };
});

const DASHBOARD = createMockDashboard({ id: 10, name: "Sales overview" });
const AUDIT_DASHBOARD_ID = 201;

const DATE_FILTER_PARAMETER = createMockParameter({
  id: "25f8871e",
  name: "Date Filter",
  slug: "date_filter",
  type: "date/all-options",
  default: "past12months~",
});

const GROUP_NAME_PARAMETER = createMockParameter({
  id: "2ea1dae2",
  name: "Group Name",
  slug: "group_name",
  type: "string/=",
  default: ["All Users"],
  required: true,
});

const DASHBOARD_NAME_PARAMETER = createMockParameter({
  id: "c02bd3d3",
  name: "Dashboard name",
  slug: "dashboard_name",
  type: "string/=",
});

const DASHBOARD_ID_PARAMETER = createMockParameter({
  id: "4b39cd95",
  name: "Dashboard ID",
  slug: "dashboard_id",
  type: "id",
});

const [VIEWS_ENTITY_ID, PEOPLE_ENTITY_ID, ACTIVITY_ENTITY_ID] =
  USAGE_STATS_CARD_ENTITY_IDS;

const VIEWS_DASHCARD = createMockDashboardCard({
  id: 1,
  card_id: 101,
  card: createMockCard({
    id: 101,
    name: "Dashboard views per month",
    display: "line",
    entity_id: createMockEntityId(VIEWS_ENTITY_ID),
  }),
});

const PEOPLE_DASHCARD = createMockDashboardCard({
  id: 2,
  card_id: 102,
  card: createMockCard({
    id: 102,
    name: "Most active people on this dashboard",
    display: "row",
    entity_id: createMockEntityId(PEOPLE_ENTITY_ID),
  }),
});

const ACTIVITY_DASHCARD = createMockDashboardCard({
  id: 3,
  card_id: 103,
  card: createMockCard({
    id: 103,
    name: "Recent activity on dashboard",
    display: "table",
    entity_id: createMockEntityId(ACTIVITY_ENTITY_ID),
  }),
});

const USAGE_STATS_DASHCARDS = [
  VIEWS_DASHCARD,
  PEOPLE_DASHCARD,
  ACTIVITY_DASHCARD,
];

type SetupOpts = {
  hasUsageAnalyticsAccess?: boolean;
  auditDashcards?: DashboardCard[];
};

function setup({
  hasUsageAnalyticsAccess = true,
  auditDashcards = [ACTIVITY_DASHCARD, VIEWS_DASHCARD, PEOPLE_DASHCARD],
}: SetupOpts = {}) {
  setupDashboardEndpoints(DASHBOARD);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });
  setupListSubscriptionsEndpoint([]);
  setupAuditInfoEndpoint({
    auditInfo: hasUsageAnalyticsAccess
      ? { dashboard_overview: AUDIT_DASHBOARD_ID }
      : {},
  });
  setupDashboardEndpoints(
    createMockDashboard({
      id: AUDIT_DASHBOARD_ID,
      name: "Dashboard overview",
      parameters: [
        DATE_FILTER_PARAMETER,
        GROUP_NAME_PARAMETER,
        DASHBOARD_ID_PARAMETER,
        DASHBOARD_NAME_PARAMETER,
      ],
      dashcards: auditDashcards,
    }),
  );
  USAGE_STATS_DASHCARDS.forEach((dashcard) =>
    setupDashcardQueryEndpoints(
      AUDIT_DASHBOARD_ID,
      dashcard,
      createMockDataset(),
    ),
  );

  renderWithProviders(
    <Route
      path="/data-studio/dashboards/:dashboardId/usage"
      element={<DashboardUsageStatsPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/dashboards/${DASHBOARD.id}/usage`,
    },
  );
}

describe("DashboardUsageStatsPage", () => {
  it("shows the usage stats cards of the dashboard in order", async () => {
    setup();

    const cards = await screen.findAllByTestId("usage-stats-card");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent("Dashboard views per month");
    expect(cards[1]).toHaveTextContent("Most active people on this dashboard");
    expect(cards[2]).toHaveTextContent("Recent activity on dashboard");
    expect(
      await within(cards[0]).findByTestId("visualization"),
    ).toHaveTextContent("line");
  });

  it("filters each card to the dashboard with the audit dashboard defaults", async () => {
    setup();

    await screen.findAllByTestId("visualization");
    const lastCall = fetchMock.callHistory.lastCall(
      `path:/api/dashboard/${AUDIT_DASHBOARD_ID}/dashcard/${VIEWS_DASHCARD.id}/card/${VIEWS_DASHCARD.card_id}/query`,
    );
    const body: unknown = await lastCall?.request?.json();
    expect(body).toEqual({
      parameters: [
        {
          id: DATE_FILTER_PARAMETER.id,
          type: "date/all-options",
          value: "past12months~",
        },
        {
          id: GROUP_NAME_PARAMETER.id,
          type: "string/=",
          value: ["All Users"],
        },
        {
          id: DASHBOARD_ID_PARAMETER.id,
          type: "id",
          value: [DASHBOARD.id],
        },
      ],
    });
  });

  it("tells the user they need access to Usage analytics", async () => {
    setup({ hasUsageAnalyticsAccess: false });

    expect(
      await screen.findByText(
        "To see usage stats, you need access to the Usage analytics collection.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("usage-stats-card")).not.toBeInTheDocument();
  });

  it("tells the user usage stats are unavailable when no audit card matches", async () => {
    setup({ auditDashcards: [] });

    expect(
      await screen.findByText(
        "Usage stats aren't available for this dashboard.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("usage-stats-card")).not.toBeInTheDocument();
  });
});
