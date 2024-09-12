import { setupUserEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { ModerationReview, User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import {
  ModerationReviewBanner,
  ModerationReviewText,
} from "./ModerationReviewBanner";

const moderationReview: ModerationReview = {
  most_recent: true,
  status: "verified",
  moderator_id: 1,
  created_at: "1997-10-10T03:30:30",
};
const moderator: User = createMockUser({ id: 1, common_name: "Foo" });
const currentUser: User = createMockUser({ id: 2, common_name: "Bar" });

describe("ModerationReviewBanner", () => {
  it("should show text concerning the given review", async () => {
    setupUserEndpoints(moderator);

    renderWithProviders(
      <ModerationReviewBanner moderationReview={moderationReview} />,
      {
        storeInitialState: {
          currentUser,
        },
      },
    );
    expect(await screen.findByText("Foo verified this")).toBeInTheDocument();
  });
});

describe("ModerationReviewText", () => {
  it("should show text concerning the given review", async () => {
    setupUserEndpoints(moderator);

    renderWithProviders(
      <ModerationReviewText
        question={
          new Question({
            moderation_reviews: [moderationReview],
          })
        }
      />,
      {
        storeInitialState: {
          currentUser,
        },
      },
    );
    expect(await screen.findByText(/Foo verified this/)).toBeInTheDocument();
    expect(await screen.findByText(/years ago/)).toBeInTheDocument();
  });
});
