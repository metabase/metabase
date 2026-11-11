import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDashboardQueryMetadataEndpoint } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import type { ModerationReview } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockModerationReview,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

const DASHBOARD_ID = 7;

const setupPremium = async ({ isAdmin = true } = {}) => {
  let reviews: ModerationReview[] = [];
  const getDashboard = () =>
    createMockDashboard({
      id: DASHBOARD_ID,
      name: "Verifiable dashboard",
      can_write: true,
      dashcards: [createMockDashboardCard({ dashboard_id: DASHBOARD_ID })],
      moderation_reviews: reviews,
    });

  fetchMock.get(`path:/api/dashboard/${DASHBOARD_ID}`, () => getDashboard());
  setupDashboardQueryMetadataEndpoint(
    getDashboard(),
    createMockDashboardQueryMetadata(),
  );
  fetchMock.post("path:/api/moderation-review", async ({ options }) => {
    const body = JSON.parse(String(options.body));
    if (
      body.moderated_item_id !== DASHBOARD_ID ||
      body.moderated_item_type !== "dashboard"
    ) {
      return 400;
    }
    const review = createMockModerationReview({
      status: body.status,
      moderated_item_id: DASHBOARD_ID,
      moderated_item_type: "dashboard",
      most_recent: true,
    });
    reviews = [
      review,
      ...reviews.map((review) => ({ ...review, most_recent: false })),
    ];
    return review;
  });

  await setup({
    dashboard: getDashboard(),
    isAdmin,
    readDashboardFromStore: true,
    tokenFeatures: { content_verification: true },
    enterprisePlugins: ["moderation"],
  });
};

const openDashboardMenu = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: "Move, trash, and more…" }),
  );
  return screen.findByRole("menu");
};

const getModerationRequestBodies = async () =>
  Promise.all(
    fetchMock.callHistory
      .calls("path:/api/moderation-review", { method: "POST" })
      .map(async (call) => JSON.parse(String(call.options.body))),
  );

describe("DashboardHeader - premium", () => {
  describe("content verification", () => {
    it("lets an admin verify and unverify a dashboard", async () => {
      await setupPremium();
      const header = screen.getByTestId("dashboard-header");

      expect(
        within(header).getByText("Verifiable dashboard"),
      ).toBeInTheDocument();
      expect(
        within(header).queryByRole("img", { name: /verified/ }),
      ).not.toBeInTheDocument();

      const menu = await openDashboardMenu();
      expect(
        within(menu).queryByText("Remove verification"),
      ).not.toBeInTheDocument();
      await userEvent.click(within(menu).getByText("Verify this dashboard"));

      expect(
        await within(screen.getByTestId("dashboard-header")).findByRole("img", {
          name: /verified/,
        }),
      ).toBeInTheDocument();
      expect(await getModerationRequestBodies()).toEqual([
        {
          moderated_item_id: DASHBOARD_ID,
          moderated_item_type: "dashboard",
          status: "verified",
        },
      ]);

      const menuAfterVerify = await openDashboardMenu();
      expect(
        within(menuAfterVerify).queryByText("Verify this dashboard"),
      ).not.toBeInTheDocument();
      await userEvent.click(
        within(menuAfterVerify).getByText("Remove verification"),
      );

      await waitFor(() =>
        expect(
          within(screen.getByTestId("dashboard-header")).queryByRole("img", {
            name: /verified/,
          }),
        ).not.toBeInTheDocument(),
      );
      expect(await getModerationRequestBodies()).toEqual([
        {
          moderated_item_id: DASHBOARD_ID,
          moderated_item_type: "dashboard",
          status: "verified",
        },
        {
          moderated_item_id: DASHBOARD_ID,
          moderated_item_type: "dashboard",
          status: null,
        },
      ]);
    });

    it("does not let a non-admin verify a dashboard", async () => {
      await setupPremium({ isAdmin: false });

      const menu = await openDashboardMenu();
      expect(within(menu).getByText("Move")).toBeInTheDocument();
      expect(
        within(menu).queryByText("Verify this dashboard"),
      ).not.toBeInTheDocument();
    });
  });
});
