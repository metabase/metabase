import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockModerationReview,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts: SetupOpts) => {
  return setup({
    ...opts,
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

  describe("entity id display", () => {
    it("should not show entity ids without serialization feature", async () => {
      const card = createMockCard({
        entity_id: "jenny8675309" as Card["entity_id"],
      });
      await setupEnterprise({ card });

      expect(screen.queryByText("Entity ID")).not.toBeInTheDocument();
      expect(screen.queryByText("jenny8675309")).not.toBeInTheDocument();
    });
  });

  describe("tabs", () => {
    describe("for non-admins", () => {
      it("should show tabs for Overview, History, and Relationships", async () => {
        await setup();
        const tabs = await screen.findAllByRole("tab");
        expect(tabs).toHaveLength(3);
        expect(tabs.map((tab) => tab.textContent)).toEqual([
          "Overview",
          "History",
          "Relationships",
        ]);
      });
    });

    describe("for admins", () => {
      it("should show tabs for Overview, History, Relationships, and Insights", async () => {
        setup({ user: { is_superuser: true } });
        const tabs = await screen.findAllByRole("tab");
        expect(tabs).toHaveLength(4);
        expect(tabs.map((tab) => tab.textContent)).toEqual([
          "Overview",
          "History",
          "Relationships",
          "Insights",
        ]);
        const insightsTab = await screen.findByRole("tab", {
          name: "Insights",
        });
        await userEvent.click(insightsTab);
        expect(
          await screen.findByText(/See who.s doing what, when/),
        ).toBeInTheDocument();
      });
    });
  });
});
