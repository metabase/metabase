import { setupUserEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { ModerationReview } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { QuestionModerationSection } from "./QuestionModerationSection";

const moderator = createMockUser({ id: 1, common_name: "Foo" });
const currentUser = createMockUser({
  id: 2,
  common_name: "Bar",
  is_superuser: true,
});

const verifiedReview: ModerationReview = {
  most_recent: true,
  status: "verified",
  moderator_id: 1,
  created_at: "1997-10-10T03:30:30",
  user: moderator,
};

const removedReview: ModerationReview = {
  ...verifiedReview,
  status: null,
};

const setup = (
  moderationReviews: ModerationReview[],
  props: { reviewBannerClassName?: string } = {},
) => {
  setupUserEndpoints(moderator);
  const question = new Question({ moderation_reviews: moderationReviews });

  return renderWithProviders(
    <QuestionModerationSection question={question} {...props} />,
    { storeInitialState: { currentUser } },
  );
};

describe("QuestionModerationSection", () => {
  it("renders the moderation review banner for the latest review", async () => {
    setup([verifiedReview]);

    expect(await screen.findByText("Foo verified this")).toBeInTheDocument();
  });

  it("passes reviewBannerClassName through to the banner", async () => {
    setup([verifiedReview], { reviewBannerClassName: "my-banner" });

    const banner = await screen.findByText("Foo verified this");
    expect(banner.closest(".my-banner")).toBeInTheDocument();
  });

  it("renders nothing when the question has no moderation reviews", () => {
    setup([]);

    expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
  });

  it("renders nothing when the latest review was removed", () => {
    setup([removedReview]);

    expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
  });
});
