import { screen, waitFor } from "@testing-library/react";

import {
  findRequests,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupNotificationChannelsEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { renderWithProviders } from "__support__/ui";
import { DashboardContextProvider } from "metabase/dashboard/context";
import type { DashboardCard } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDataset,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DashboardSubscriptionsButton } from "./DashboardSubscriptionsButton";

const tableCard = createMockCard({
  id: 1,
  dataset_query: createMockStructuredDatasetQuery({
    query: { "source-table": ORDERS_ID },
  }),
  name: "Here is a card title",
});
const tableDashcard = createMockDashboardCard({
  id: 1,
  card_id: tableCard.id,
  card: tableCard,
});

interface SetupOpts {
  dashcards?: DashboardCard[];
  emailConfigured?: boolean;
}
const setup = ({
  emailConfigured,
  dashcards = [tableDashcard],
}: SetupOpts = {}) => {
  setupNotificationChannelsEndpoints({
    email: {
      configured: emailConfigured,
    },
  });

  const dashboardId = 1;
  setupDashboardRelatedEndpoints(dashboardId, dashcards);
  renderWithProviders(
    <DashboardContextProvider
      dashboardId={dashboardId}
      navigateToNewCardFromDashboard={jest.fn()}
    >
      <DashboardSubscriptionsButton />
    </DashboardContextProvider>,
  );
};

describe("DashboardSubscriptionsButton", () => {
  it("should render the subscriptions button when email is configured", async () => {
    setup({ emailConfigured: true });

    expect(
      await screen.findByRole("button", { name: "Subscriptions" }),
    ).toBeInTheDocument();
    const subscriptionChannelInfoRequests =
      await getSubscriptionChannelInfoRequests();
    expect(subscriptionChannelInfoRequests).toHaveLength(1);
  });

  it("should not render the subscriptions button when email is not configured", async () => {
    setup({ emailConfigured: false });
    // Ensure the API finishes loading, otherwise, the assertion below will always pass because the API hasn't returned yet
    await waitFor(async () => {
      expect(await getSubscriptionChannelInfoRequests()).toHaveLength(1);
    });
    expect(
      screen.queryByRole("button", { name: "Subscriptions" }),
    ).not.toBeInTheDocument();
  });

  it("should not render the subscriptions button when there are no data cards on the dashboard even when email is configured", async () => {
    setup({
      emailConfigured: true,
      dashcards: [],
    });

    // Ensure the API finishes loading, otherwise, the assertion below will always pass because the API hasn't returned yet
    await waitFor(async () => {
      expect(await getDashboardRequests()).toHaveLength(1);
    });
    expect(
      screen.queryByRole("button", { name: "Subscriptions" }),
    ).not.toBeInTheDocument();
  });
});

function setupDashboardRelatedEndpoints(
  dashboardId: number,
  dashcards: DashboardCard[],
) {
  const dashboard = createMockDashboard({
    id: dashboardId,
    name: "Test Dashboard",
    dashcards,
  });
  const database = createSampleDatabase();

  setupDashboardEndpoints(dashboard);

  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({
      databases: [database],
    }),
  );

  setupDashcardQueryEndpoints(dashboardId, tableDashcard, createMockDataset());

  return dashboardId;
}

async function getSubscriptionChannelInfoRequests() {
  const gets = await findRequests("GET");
  return gets.filter((req) =>
    req.url.match(new RegExp("/api/pulse/form_input$")),
  );
}

async function getDashboardRequests() {
  const gets = await findRequests("GET");
  return gets.filter((req) =>
    req.url.match(new RegExp(`/api/dashboard/\\d+(?!/)`)),
  );
}
