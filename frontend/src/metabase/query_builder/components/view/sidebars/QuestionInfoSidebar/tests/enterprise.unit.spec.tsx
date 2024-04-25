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

describe("QuestionInfoSidebar", () => {
  describe("cache ttl", () => {
    it("should not allow to configure caching", async () => {
      const card = createMockCard({
        cache_ttl: 10,
        description: "abc",
      });
      await setupEnterprise({ card });
      expect(screen.getByText(card.description ?? "")).toBeInTheDocument();
      expect(screen.queryByText("Cache Configuration")).not.toBeInTheDocument();
    });
  });

  describe("moderation reviews", () => {
    it("should not show the verification badge", async () => {
      const card = createMockCard({
        moderation_reviews: [
          createMockModerationReview({ status: "verified" }),
        ],
      });
      await setupEnterprise({ card });
      expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
    });
  });
});
