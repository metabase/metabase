import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  type RenderSharingMenu,
  describeEmbedFlowFromSharingMenu,
  getPutBodies,
  getResourceRequests,
  openEmbedFlow,
  resetEmbedFlowMocks,
  setupSharingMenuEmbedFlow,
} from "__support__/sharing-menu-embed-flow";
import { screen, waitFor, within } from "__support__/ui";
import { DashboardSharingMenu } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/DashboardSharingMenu/DashboardSharingMenu";

// Usage analytics of the embed.js host page, reported a second after an embed
// mounts, when the preview may already be gone.
jest.mock("metabase/embedding/embedding-iframe-sdk/analytics", () => ({
  debouncedReportAnalytics: jest.fn(),
}));

const renderSharingMenu: RenderSharingMenu = ({ dashboard }) => (
  <DashboardSharingMenu dashboard={dashboard} />
);

describeEmbedFlowFromSharingMenu("dashboard", renderSharingMenu);

describe("Dashboard sharing menu > embed flow > editions", () => {
  afterEach(() => {
    resetEmbedFlowMocks();
  });

  describe("Pro instance with no embedding terms accepted (EMB-1884)", () => {
    it("lets Guest embedding proceed after accepting only the Guest terms", async () => {
      setupSharingMenuEmbedFlow({
        renderSharingMenu,
        resourceType: "dashboard",
        isPro: true,
        settings: {
          "enable-embedding-modular": false,
          "show-modular-embed-terms": true,
          // The backend always sends `false` on Pro (`hide-embed-branding?`)
          "show-static-embed-terms": false,
        },
      });

      await openEmbedFlow();
      await userEvent.click(screen.getByLabelText("Guest"));

      // The option cards share a wrapper that is dimmed and not interactive
      // until the selected auth type is ready. Jest stubs CSS modules, so only
      // the opacity, set from the same flag as `pointer-events`, is visible.
      const getOptionCards = () =>
        // The wrapper has no role or label; the e2e test found it the same way.
        // eslint-disable-next-line testing-library/no-node-access
        screen.getByText("Behavior").closest<HTMLElement>("[style*='opacity']");
      expect(getOptionCards()).toHaveStyle({ opacity: "0.5" });

      const enableCard = screen.getByTestId("enable-embedding-card");
      await userEvent.click(within(enableCard).getByRole("button"));

      await waitFor(() =>
        expect(getOptionCards()).toHaveStyle({ opacity: "1" }),
      );
      // Accepted from the Guest option, without switching to SSO. On Pro both
      // auth types share the setting and the modular embedding terms.
      const settingRequests = fetchMock.callHistory.calls("path:/api/setting", {
        method: "PUT",
      });
      expect(
        settingRequests.map(({ options }): unknown =>
          JSON.parse(String(options.body)),
        ),
      ).toEqual([
        { "enable-embedding-modular": true, "show-modular-embed-terms": false },
      ]);
      expect(screen.getByDisplayValue("guest-embed")).toBeChecked();

      await userEvent.click(screen.getByLabelText("Allow downloads"));
      expect(screen.getByLabelText("Allow downloads")).toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Get code" }));
      await userEvent.click(await screen.findByText("publish this dashboard"));
      await waitFor(() => expect(getResourceRequests("PUT")).toHaveLength(2));
      expect(getPutBodies()).toEqual([
        { enable_embedding: true, embedding_type: "guest-embed" },
        {
          embedding_params: {
            created_at: "disabled",
            price: "disabled",
            category: "disabled",
          },
          embedding_type: "guest-embed",
        },
      ]);

      expect(await screen.findByTestId("embed-code-snippet")).toHaveTextContent(
        'with-downloads="true"',
      );
    });
  });

  describe("Pro instance with modular embedding disabled", () => {
    it("asks to enable modular embedding for SSO", async () => {
      setupSharingMenuEmbedFlow({
        renderSharingMenu,
        resourceType: "dashboard",
        isPro: true,
        settings: { "enable-embedding-modular": false },
      });

      await openEmbedFlow();
      await userEvent.click(screen.getByLabelText("Metabase account (SSO)"));

      expect(screen.getByTestId("enable-embedding-card")).toHaveTextContent(
        /modular embedding/,
      );
    });
  });

  describe("OSS instance", () => {
    it("shows the upsell for embedded analytics", async () => {
      setupSharingMenuEmbedFlow({
        resourceType: "dashboard",
        renderSharingMenu,
      });

      await openEmbedFlow();

      const upsell = await screen.findByTestId("upsell-card");
      expect(
        within(upsell).getByText("Get more powerful embedding"),
      ).toBeVisible();
      expect(within(upsell).getByText("Upgrade to Metabase Pro")).toBeVisible();
    });
  });
});
