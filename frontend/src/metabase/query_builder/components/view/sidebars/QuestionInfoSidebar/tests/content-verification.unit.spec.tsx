import {
  createMockCard,
  createMockModerationReview,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupContentVerification = (opts: SetupOpts) => {
  return setup({
    ...opts,
    settings: createMockSettings({
      ...opts?.settings,
      "token-features": createMockTokenFeatures({ content_verification: true }),
    }),
    hasEnterprisePlugins: true,
  });
};

describe("QuestionInfoSidebar", () => {
  it("should show the verification badge if verified", async () => {
    const card = createMockCard({
      moderation_reviews: [createMockModerationReview({ status: "verified" })],
    });
    await setupContentVerification({ card });
    expect(screen.getByText(/verified this/)).toBeInTheDocument();
  });

  it("should not show the verification badge if not verified", async () => {
    const card = createMockCard({
      moderation_reviews: [],
    });
    await setupContentVerification({ card });
    expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
  });
});
