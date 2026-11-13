import fetchMock from "fetch-mock";
import _ from "underscore";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  setupEmbedDashboardEndpoints,
  setupPublicDashboardEndpoint,
} from "__support__/server-mocks/embed";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { registerStaticVisualizations } from "metabase/static-viz/register";
import { defer } from "metabase/utils/promise";
import type {
  DashboardCard,
  DashboardTab,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockDatabase,
  createMockDataset,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { PublicOrEmbeddedDashboardPage } from "../PublicOrEmbeddedDashboardPage";

const MOCK_UUID = "00000000-0000-4000-8000-000000000000";

const MOCK_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjExfSwicGFyYW1zIjp7fSwiaWF0IjoxNzEyNjg0NTA1LCJfZW1iZWRkaW5nX3BhcmFtcyI6e319.WbZTB-cQYh4gjh61ZzoLOcFbJ6j6RlOY3GS4fwzv3W4";

registerStaticVisualizations();
registerDashboardVisualizations();

export type SetupOpts = {
  hash?: Record<string, string>;
  queryString?: string;
  numberOfTabs?: number;
  tokenFeatures?: TokenFeatures;
  dashboardTitle: string;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  /** Holds the dashboard request until `releaseDashboardRequest` is called. */
  holdDashboardRequest?: boolean;
  /** Dashcards added to the first tab, next to its question card. */
  extraDashcards?: DashboardCard[];
  /** Renders the static embed (`/embed/dashboard/:token`) or the public link (`/public/dashboard/:uuid`). */
  accessType?: "embed" | "public";
  /** Shows the "Powered by Metabase" footer. The mock settings hide it by default. */
  hasEmbedBranding?: boolean;
};

export async function setup(
  {
    hash = {},
    queryString = "",
    numberOfTabs = 1,
    tokenFeatures = createMockTokenFeatures(),
    dashboardTitle,
    enterprisePlugins,
    holdDashboardRequest = false,
    extraDashcards = [],
    accessType = "embed",
    hasEmbedBranding,
  }: SetupOpts = { dashboardTitle: "" },
) {
  const settings = mockSettings({
    "token-features": tokenFeatures,
    ...(hasEmbedBranding !== undefined && {
      "hide-embed-branding?": !hasEmbedBranding,
    }),
  });
  setupDatabasesEndpoints([createMockDatabase()]);

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  const tabs: DashboardTab[] = [];
  const dashcards: DashboardCard[] = [];

  _.times(numberOfTabs, (i) => {
    const tabId = i + 1;

    tabs.push(createMockDashboardTab({ id: tabId, name: `Tab ${tabId}` }));
    dashcards.push(
      createMockDashboardCard({
        id: i + 1,
        card_id: i + 1,
        card: createMockCard({
          id: i + 1,
          //`can_write` is false in public or embedded contexts
          // without this we'd have the "Edit" button in the dashcard menu
          can_write: false,
        }),
        dashboard_tab_id: tabId,
      }),
    );
  });

  dashcards.push(
    ...extraDashcards.map((dashcard) => ({
      ...dashcard,
      dashboard_tab_id: tabs[0]?.id,
    })),
  );

  const dashboard = createMockDashboard({
    id: 1,
    name: dashboardTitle,
    parameters: [],
    dashcards,
    tabs,
  });

  const dashboardRequest = defer();
  if (holdDashboardRequest) {
    // Registered first, so it answers the dashboard request instead of the
    // route `setupEmbedDashboardEndpoints` adds.
    fetchMock.get(`path:/api/embed/dashboard/${MOCK_TOKEN}`, () =>
      dashboardRequest.promise.then(() => dashboard),
    );
  }
  setupEmbedDashboardEndpoints(MOCK_TOKEN, dashboard, dashcards);
  setupPublicDashboardEndpoint(MOCK_UUID, dashboard);
  dashcards.forEach(({ id, card_id }) => {
    fetchMock.get(
      `path:/api/public/dashboard/${MOCK_UUID}/dashcard/${id}/card/${card_id}`,
      createMockDataset(),
    );
  });

  const pathname =
    accessType === "public"
      ? `/public/dashboard/${MOCK_UUID}`
      : `/embed/dashboard/${MOCK_TOKEN}`;
  const hashString = _.isEmpty(hash) ? "" : `#${new URLSearchParams(hash)}`;
  const href = `${pathname}${queryString}${hashString}`;

  // Setting initial window.location state,
  // so it can be used by getInitialSelectedTabId
  window.history.replaceState({}, "", href);

  const view = renderWithProviders(
    <>
      <Route
        path="embed/dashboard/:token"
        element={<PublicOrEmbeddedDashboardPage />}
      />
      <Route
        path="public/dashboard/:uuid"
        element={<PublicOrEmbeddedDashboardPage />}
      />
    </>,
    {
      storeInitialState: createMockState(
        hasEmbedBranding !== undefined ? { settings } : {},
      ),
      withRouter: true,
      initialRoute: href,
    },
  );

  if (numberOfTabs > 0 && !holdDashboardRequest) {
    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();
  }

  return {
    ...view,
    releaseDashboardRequest: () => dashboardRequest.resolve(),
  };
}
