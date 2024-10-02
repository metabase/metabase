import { screen } from "__support__/ui";
import {
  createMockCard,
  createMockCollection,
  createMockModerationReview,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts: SetupOpts) => {
  return setup({
    ...opts,
    settings: createMockSettings({
      "token-features": createMockTokenFeatures({
        content_verification: true,
        cache_granular_controls: true,
        audit_app: true,
      }),
    }),
    hasEnterprisePlugins: true,
  });
};

describe("QuestionInfoSidebar > premium", () => {
  describe("content verification", () => {
    it("should show the verification badge for verified content", async () => {
      const card = createMockCard({
        moderation_reviews: [
          createMockModerationReview({ status: "verified" }),
        ],
      });
      await setupEnterprise({ card });
      expect(screen.getByText(/verified this/)).toBeInTheDocument();
    });

    it("should not show the verification badge for unverified content", async () => {
      const card = createMockCard();
      await setupEnterprise({ card });
      expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
    });
  });

  describe("analytics content", () => {
    it("should show the history section for non analytics content", async () => {
      await setupEnterprise({
        card: createMockCard({
          collection: createMockCollection(),
        }),
      });

      expect(await screen.findByText("History")).toBeInTheDocument();
    });
  });

  it("should not show the history section for instance analytics question", async () => {
    await setupEnterprise({
      card: createMockCard({
        collection: createMockCollection({ type: "instance-analytics" }),
      }),
    });

    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });

  describe("tabs", () => {
    describe("for non-admins", () => {
      it("should show tabs for Overview and History and no Insights link", async () => {
        setupEnterprise({});
        const tabs = await screen.findAllByRole("tab");
        expect(tabs).toHaveLength(2);
        expect(tabs.map(tab => tab.textContent)).toEqual([
          "Overview",
          "History",
        ]);
        expect(
          screen.queryByRole("link", { name: "Insights" }),
        ).not.toBeInTheDocument();
      });
    });

    describe("for admins", () => {
      it("should show tabs for Overview and History, and a link for Insights", async () => {
        setupEnterprise({ user: { is_superuser: true } });
        const tabs = await screen.findAllByRole("tab");
        expect(tabs).toHaveLength(2);
        expect(tabs.map(tab => tab.textContent)).toEqual([
          "Overview",
          "History",
        ]);
        expect(
          await screen.findByRole("link", { name: /Insights/ }),
        ).toBeInTheDocument();
      });
    });
  });
});
