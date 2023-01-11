import React from "react";
import { render, screen } from "@testing-library/react";
import { ModerationReviewBanner } from "./ModerationReviewBanner";

const moderationReview = {
  status: "verified",
  moderator_id: 1,
  created_at: Date.now(),
};
const moderator = { id: 1, common_name: "Foo" };
const currentUser = { id: 2, common_name: "Bar" };

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
