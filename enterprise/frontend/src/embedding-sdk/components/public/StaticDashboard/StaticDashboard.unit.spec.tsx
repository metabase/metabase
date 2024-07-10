import { Box } from "@mantine/core";
import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";
import { indexBy } from "underscore";

import {
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { screen, renderWithProviders } from "__support__/ui";
import type { MetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDataset,
  createMockStructuredDatasetQuery,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { StaticDashboard, type StaticDashboardProps } from "./StaticDashboard";

const TEST_DASHBOARD_ID = 1;

interface SetupOptions {
  props?: Partial<StaticDashboardProps>;
  providerProps?: Partial<MetabaseProviderProps>;
}

const setup = async (options: SetupOptions = {}) => {
  const { props, providerProps } = options;

  const database = createSampleDatabase();

  const dataset_query = createMockStructuredDatasetQuery({
    query: { "source-table": ORDERS_ID },
  });

  const tableCard = createMockCard({
    id: 1,
    dataset_query,
    name: "Here is a card title",
  });

  const tableDashcard = createMockDashboardCard({
    id: 1,
    card_id: tableCard.id,
    card: tableCard,
  });

  const dashcards = [tableDashcard];

  const dashboardId = props?.dashboardId || TEST_DASHBOARD_ID;
  const dashboard = createMockDashboard({
    id: dashboardId,
    dashcards,
  });

  setupDashboardEndpoints(dashboard);

  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({
      databases: [database],
    }),
  );

  setupDashcardQueryEndpoints(dashboardId, tableDashcard, createMockDataset());

  const user = createMockUser();

  const state = setupSdkState({
    currentUser: user,
    dashboard: createMockDashboardState({
      dashboardId: dashboard.id,
      dashboards: {
        [dashboard.id]: {
          ...dashboard,
          dashcards: dashcards.map(dc => dc.id),
        },
      },
      dashcards: indexBy(dashcards, "id"),
    }),
  });

  renderWithProviders(
    <Box h="500px">
      <StaticDashboard dashboardId={dashboardId} {...props} />
    </Box>,
    {
      mode: "sdk",
      sdkProviderProps: {
        config: createMockConfig({
          jwtProviderUri: "http://TEST_URI/sso/metabase",
        }),
        ...providerProps,
      },
      storeInitialState: state,
    },
  );

  expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

  return {
    dashboard,
  };
};

describe("StaticDashboard", () => {
  it("shows a dashboard card question title by default", async () => {
    await setup();

    expect(screen.getByText("Here is a card title")).toBeInTheDocument();
  });

  it("hides the dashboard card question title when withCardTitle is false", async () => {
    await setup({ props: { withCardTitle: false } });

    expect(screen.queryByText("Here is a card title")).not.toBeInTheDocument();
  });

  it("should support onLoad, onLoadWithCards handlers", async () => {
    const onLoad = jest.fn();
    const onLoadWithCards = jest.fn();
    const { dashboard } = await setup({ props: { onLoad, onLoadWithCards } });

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenLastCalledWith(dashboard);

    await waitFor(() => {
      return fetchMock.called(
        `path:/api/card/${dashboard.dashcards[0].card_id}/query`,
      );
    });

    expect(onLoadWithCards).toHaveBeenCalledTimes(1);
    expect(onLoadWithCards).toHaveBeenLastCalledWith(dashboard);
  });

  it("should support global dashboard load event handlers", async () => {
    const onLoad = jest.fn();
    const onLoadWithCards = jest.fn();

    const { dashboard } = await setup({
      providerProps: {
        eventHandlers: {
          onDashboardLoad: onLoad,
          onDashboardLoadWithCards: onLoadWithCards,
        },
      },
    });

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenLastCalledWith(dashboard);

    await waitFor(() => {
      return fetchMock.called(
        `path:/api/card/${dashboard.dashcards[0].card_id}/query`,
      );
    });

    expect(onLoadWithCards).toHaveBeenCalledTimes(1);
    expect(onLoadWithCards).toHaveBeenLastCalledWith(dashboard);
  });
});
