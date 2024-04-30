import { render, screen } from "@testing-library/react";

import type { ModerationReview, User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { ModerationReviewBanner } from "./ModerationReviewBanner";

const moderationReview: ModerationReview = {
  status: "verified",
  moderator_id: 1,
  created_at: Date.now().toString(),
};
const moderator: User = createMockUser({ id: 1, common_name: "Foo" });
const currentUser: User = createMockUser({ id: 2, common_name: "Bar" });

describe("ModerationReviewBanner", () => {
  it("should show text concerning the given review", () => {
    render(
      <ModerationReviewBanner
        moderationReview={moderationReview}
        user={moderator}
        currentUser={currentUser}
      />,
    );
    expect(screen.getByText("Foo verified this")).toBeInTheDocument();
  });
});
