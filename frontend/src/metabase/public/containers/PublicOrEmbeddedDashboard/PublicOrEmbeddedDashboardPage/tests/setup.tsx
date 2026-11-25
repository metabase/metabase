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
import PublicApp from "metabase/public/containers/PublicApp";
import { Route } from "metabase/router";
import { registerStaticVisualizations } from "metabase/static-viz/register";
import { defer } from "metabase/utils/promise";
import type {
  Dashboard,
  DashboardCard,
  DashboardTab,
  EnterpriseSettings,
  QuestionDashboardCard,
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

export const MOCK_UUID = "00000000-0000-4000-8000-000000000000";

const MOCK_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjExfSwicGFyYW1zIjp7fSwiaWF0IjoxNzEyNjg0NTA1LCJfZW1iZWRkaW5nX3BhcmFtcyI6e319.WbZTB-cQYh4gjh61ZzoLOcFbJ6j6RlOY3GS4fwzv3W4";

registerStaticVisualizations();
registerDashboardVisualizations();

export type SetupOpts = {
  /** A record is encoded with `URLSearchParams`; a string is used as the raw hash, as a browser keeps it. */
  hash?: Record<string, string> | string;
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
  /** Also serves the static embed endpoints under `/api/preview_embed`, as the embed preview requests them. */
  embedPreview?: boolean;
  /** Overrides of the dashboard the endpoint returns, such as its parameters. */
  dashboard?: Partial<Omit<Dashboard, "dashcards" | "tabs">>;
  /** Overrides of the question dashcard generated for each tab. */
  getTabDashcard?: (tabId: number) => Partial<QuestionDashboardCard>;
  /** Extra settings, on top of the token features. */
  settings?: Partial<EnterpriseSettings>;
  /** Renders the page inside `PublicApp`, as the public routes do. */
  withPublicApp?: boolean;
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
    embedPreview = false,
    dashboard: dashboardOverrides = {},
    getTabDashcard,
    settings: extraSettings,
    withPublicApp = false,
  }: SetupOpts = { dashboardTitle: "" },
) {
  const settings = mockSettings({
    "token-features": tokenFeatures,
    ...extraSettings,
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
        ...getTabDashcard?.(tabId),
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
    ...dashboardOverrides,
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
  if (embedPreview) {
    setupEmbedDashboardEndpoints(MOCK_TOKEN, dashboard, dashcards, {
      basePath: "/api/preview_embed",
    });
  }
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
  const encodedHash =
    typeof hash === "string" ? hash : new URLSearchParams(hash).toString();
  const hashString = encodedHash === "" ? "" : `#${encodedHash}`;
  const href = `${pathname}${queryString}${hashString}`;

  // Setting initial window.location state,
  // so it can be used by getInitialSelectedTabId
  window.history.replaceState({}, "", href);

  const routes = (
    <>
      <Route
        path="embed/dashboard/:token"
        element={<PublicOrEmbeddedDashboardPage />}
      />
      <Route
        path="public/dashboard/:uuid"
        element={<PublicOrEmbeddedDashboardPage />}
      />
    </>
  );

  const view = renderWithProviders(
    withPublicApp ? <Route element={<PublicApp />}>{routes}</Route> : routes,
    {
      storeInitialState: createMockState({ settings }),
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
