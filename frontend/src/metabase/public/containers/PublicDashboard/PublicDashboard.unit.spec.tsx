import { Route } from "react-router";

import fetchMock from "fetch-mock";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";
import registerVisualizations from "metabase/visualizations/register";
import { setupEmbedDashboardEndpoints } from "__support__/server-mocks/embed";
import PublicDashboard from "./PublicDashboard";

registerVisualizations();

type SetupOpts = {
  dashboard: Dashboard;
  token?: string;
};

const MOCK_TOKEN = "mock.jwt.token"; // this needs to match the format expected in `isJWT`

function setup({ token = MOCK_TOKEN, dashboard }: SetupOpts) {
  setupEmbedDashboardEndpoints(token, dashboard);

  renderWithProviders(
    <Route
      path="/embed/dashboard/:token"
      component={props => <PublicDashboard {...props}></PublicDashboard>}
    />,
    {
      mode: "public",
      initialRoute: `/embed/dashboard/${MOCK_TOKEN}`,
      withRouter: true,
    },
  );
}

describe("PublicDashboard", () => {
  describe("when an endpoint of a card returns 'Token is expired' (metabase#11728)", () => {
    it("should prompt the user to refresh the page", async () => {
      const mockDashcard = createMockDashboardCard({
        id: 3,
        card: createMockCard({ id: 8 }),
      });

      const mockDashboard = createMockDashboard({
        dashcards: [mockDashcard],
      });

      fetchMock.get(
        `path:/api/embed/dashboard/${MOCK_TOKEN}/dashcard/${mockDashcard.id}/card/${mockDashcard.card.id}`,
        {
          body: {
            message: "Token is expired.",
            error_code: "embed-token-expired",
          },
          status: 400,
        },
      );

      setup({ token: MOCK_TOKEN, dashboard: mockDashboard });

      await waitFor(() =>
        expect(screen.queryByText("Loading")).not.toBeInTheDocument(),
      );

      expect(
        screen.getByText("Please reload the page.", { exact: false }),
      ).toBeInTheDocument();

      expect(
        screen.getByText("Contact your admin if the problem persists.", {
          exact: false,
        }),
      ).toBeInTheDocument();
    });
  });
});
