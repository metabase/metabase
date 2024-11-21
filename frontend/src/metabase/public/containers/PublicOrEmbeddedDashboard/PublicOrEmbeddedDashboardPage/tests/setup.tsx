import fetchMock from "fetch-mock";
import { Route } from "react-router";
import _ from "underscore";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupEmbedDashboardEndpoints } from "__support__/server-mocks/embed";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { registerStaticVisualizations } from "metabase/static-viz/register";
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
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PublicOrEmbeddedDashboardPage } from "../PublicOrEmbeddedDashboardPage";

const MOCK_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjExfSwicGFyYW1zIjp7fSwiaWF0IjoxNzEyNjg0NTA1LCJfZW1iZWRkaW5nX3BhcmFtcyI6e319.WbZTB-cQYh4gjh61ZzoLOcFbJ6j6RlOY3GS4fwzv3W4";

registerStaticVisualizations();

export type SetupOpts = {
  hash?: Record<string, string>;
  queryString?: string;
  numberOfTabs?: number;
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
  dashboardTitle: string;
};

export async function setup(
  {
    hash = {},
    queryString = "",
    numberOfTabs = 1,
    tokenFeatures = createMockTokenFeatures(),
    hasEnterprisePlugins = false,
    dashboardTitle,
  }: SetupOpts = { dashboardTitle: "" },
) {
  mockSettings({
    "token-features": tokenFeatures,
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const tabs: DashboardTab[] = [];
  const dashcards: DashboardCard[] = [];

  _.times(numberOfTabs, i => {
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

  const dashboard = createMockDashboard({
    id: 1,
    name: dashboardTitle,
    parameters: [],
    dashcards,
    tabs,
  });

  setupEmbedDashboardEndpoints(MOCK_TOKEN, dashboard, dashcards);

  if (hash.locale) {
    fetchMock.get(`path:/app/locales/${hash.locale}.json`, {
      headers: {
        language: "ko",
        "plural-forms": "nplurals=1; plural=0;",
      },
      translations: {
        "": {},
      },
    });
  }

  const pathname = `/embed/dashboard/${MOCK_TOKEN}`;
  const hashString = _.isEmpty(hash) ? "" : `#${new URLSearchParams(hash)}`;
  const href = `${pathname}${queryString}${hashString}`;

  // Setting initial window.location state,
  // so it can be used by getInitialSelectedTabId
  window.history.replaceState({}, "", href);

  const view = renderWithProviders(
    <Route
      path="embed/dashboard/:token"
      component={PublicOrEmbeddedDashboardPage}
    />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: href,
    },
  );

  if (numberOfTabs > 0) {
    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();
  }

  return view;
}
