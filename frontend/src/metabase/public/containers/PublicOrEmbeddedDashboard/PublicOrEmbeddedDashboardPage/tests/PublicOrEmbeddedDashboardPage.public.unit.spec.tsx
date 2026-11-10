import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import {
  createMockActionDashboardCard,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

const DASHBOARD_TITLE = "Actions Dashboard";

// The public route registers request interceptors for the whole module, so it
// gets its own spec file instead of sharing one with the static embed route.
describe("PublicOrEmbeddedDashboardPage (public link)", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should hide action buttons on a public dashboard (metabase#34395)", async () => {
    await setup({
      dashboardTitle: DASHBOARD_TITLE,
      accessType: "public",
      extraDashcards: [
        createMockActionDashboardCard({
          id: 100,
          action: createMockImplicitQueryAction({ name: "Create" }),
        }),
      ],
    });

    expect(
      screen.getByRole("heading", { name: DASHBOARD_TITLE }),
    ).toBeInTheDocument();
    const grid = screen.getByTestId("dashboard-grid");
    expect(within(grid).getAllByTestId("dashcard")).toHaveLength(1);
    expect(within(grid).queryByText("Click me")).not.toBeInTheDocument();
  });
});
