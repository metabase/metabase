import { screen } from "__support__/ui";
import {
  createMockCard,
  createMockModerationReview,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupContentVerification = (opts: SetupOpts) => {
  return setup({
    ...opts,
    settings: createMockSettings({
      ...opts?.settings,
      "token-features": createMockTokenFeatures({ content_verification: true }),
    }),
    enterprisePlugins: ["content_verification", "moderation"],
  });
};

describe("QuestionInfoSidebar", () => {
  it("should show the verification badge if verified", async () => {
    const card = createMockCard({
      moderation_reviews: [createMockModerationReview({ status: "verified" })],
    });
    await setupContentVerification({ card });
    expect(await screen.findByText(/verified this/)).toBeInTheDocument();
  });

  it("should not show the verification badge if not verified", async () => {
    const card = createMockCard({
      moderation_reviews: [],
    });
    await setupContentVerification({ card });
    expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
  });
});
