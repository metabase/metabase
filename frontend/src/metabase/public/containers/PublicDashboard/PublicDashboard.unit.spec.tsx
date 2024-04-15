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

describe("PublicDashboard", () => {
  it("should display dashboard tabs", async () => {
    await setup({ numberOfTabs: 2 });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should display dashboard tabs if title is disabled (metabase#41195)", async () => {
    await setup({ hash: "titled=false", numberOfTabs: 2 });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should not display the header if title is disabled and there is only one tab (metabase#41393)", async () => {
    await setup({ hash: "titled=false", numberOfTabs: 1 });

    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("embedframe-header")).not.toBeInTheDocument();
  });

  it("should display the header if title is enabled and there is only one tab", async () => {
    await setup({ numberOfTabs: 1, hash: "titled=true" });

    expect(screen.getByTestId("embedframe-header")).toBeInTheDocument();
    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
  });
});

async function setup({
  hash,
  numberOfTabs = 1,
}: { hash?: string; numberOfTabs?: number } = {}) {
  const dashboard = createMockDashboard({
    id: 1,
    name: DASHBOARD_TITLE,
    parameters: [],
    dashcards: [],
    tabs: Array.from({ length: numberOfTabs }, (_, i) =>
      createMockDashboardTab({ id: i + 1, name: `Tab ${i + 1}` }),
    ),
  });

  setupEmbedDashboardEndpoints(MOCK_TOKEN, dashboard);

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
