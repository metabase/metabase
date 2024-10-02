import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import {
  createMockCard,
  createMockModerationReview,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts: SetupOpts) => {
  return setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
};

describe("QuestionInfoSidebar > enterprise", () => {
  describe("moderation reviews", () => {
    it("should not show the verification badge without content verification feature", async () => {
      const card = createMockCard({
        moderation_reviews: [
          createMockModerationReview({ status: "verified" }),
        ],
      });
      await setupEnterprise({ card });
      expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
    });
  });

  describe("tabs", () => {
    describe("for non-admins", () => {
      it("should show tabs for Overview and History", async () => {
        setup({});
        const tabs = await screen.findAllByRole("tab");
        expect(tabs).toHaveLength(2);
        expect(tabs.map(tab => tab.textContent)).toEqual([
          "Overview",
          "History",
        ]);
      });
    });

    describe("for admins", () => {
      it("should show tabs for Overview, History, and Insights", async () => {
        setup({ user: { is_superuser: true } });
        const tabs = await screen.findAllByRole("tab");
        expect(tabs).toHaveLength(3);
        expect(tabs.map(tab => tab.textContent)).toEqual([
          "Overview",
          "History",
          "Insights",
        ]);
        const insightsTab = await screen.findByRole("tab", {
          name: "Insights",
        });
        userEvent.click(insightsTab);
        expect(
          await screen.findByText(/See who.s doing what, when/),
        ).toBeInTheDocument();
      });
    });
  });
});
