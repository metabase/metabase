import { Route } from "react-router";

import { setupEmbedDashboardEndpoints } from "__support__/server-mocks/embed";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDashboard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PublicDashboard } from "./PublicDashboard";

const MOCK_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjExfSwicGFyYW1zIjp7fSwiaWF0IjoxNzEyNjg0NTA1LCJfZW1iZWRkaW5nX3BhcmFtcyI6e319.WbZTB-cQYh4gjh61ZzoLOcFbJ6j6RlOY3GS4fwzv3W4";
const DASHBOARD_TITLE = '"My test dash"';

const DASHBOARD_WITH_TABS = createMockDashboard({
  id: 1,
  name: DASHBOARD_TITLE,
  parameters: [],
  dashcards: [],
  tabs: [
    createMockDashboardTab({ id: 1, name: "Tab 1" }),
    createMockDashboardTab({ id: 2, name: "Tab 2" }),
  ],
});

describe("PublicDashboard", () => {
  it("should display dashboard tabs", async () => {
    await setup();

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should display dashboard tabs if title is disabled (metabase#41195)", async () => {
    await setup({ hash: "titled=false" });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });
});

async function setup({ hash }: { hash?: string } = {}) {
  setupEmbedDashboardEndpoints(MOCK_TOKEN, DASHBOARD_WITH_TABS);

  renderWithProviders(
    <Route path="embed/dashboard/:token" component={PublicDashboard} />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: `embed/dashboard/${MOCK_TOKEN}${hash ? "#" + hash : ""}`,
    },
  );

  expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();
}
