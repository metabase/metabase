import React from "react";
import { ModerationReviewBanner } from "./ModerationReviewBanner";
import { render } from "@testing-library/react";

const moderationReview = {
  status: "verified",
  moderator_id: 1,
  created_at: Date.now(),
};
const moderator = { id: 1, common_name: "Foo" };
const currentUser = { id: 2, common_name: "Bar" };

describe("ModerationReviewBanner", () => {
  it("should show text concerning the given review", () => {
    const { getByText } = render(
      <ModerationReviewBanner
        moderationReview={moderationReview}
        user={moderator}
        currentUser={currentUser}
      />,
    );
    expect(getByText("Foo verified this")).toBeTruthy();
  });
});
