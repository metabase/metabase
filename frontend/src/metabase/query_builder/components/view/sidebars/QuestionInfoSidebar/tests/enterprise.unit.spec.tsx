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
});
