import React from "react";
import { ModerationReviewBanner } from "./ModerationReviewBanner";
import { render, fireEvent } from "@testing-library/react";

const VERIFIED_ICON_SELECTOR = ".Icon-verified";
const CLOSE_ICON_SELECTOR = ".Icon-close";

const moderationReview = {
  status: "verified",
  moderator_id: 1,
  created_at: Date.now(),
};
const moderator = { id: 1, display_name: "Foo" };
const currentUser = { id: 2, display_name: "Bar" };

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

  describe("when not provided an onRemove prop", () => {
    let getByRole;
    let container;
    beforeEach(() => {
      const wrapper = render(
        <ModerationReviewBanner
          moderationReview={moderationReview}
          user={moderator}
          currentUser={currentUser}
        />,
      );

      getByRole = wrapper.getByRole;
      container = wrapper.container;
    });

    it("should render a status icon, not a button", () => {
      expect(() => getByRole("button")).toThrow();
    });

    it("should render with the icon relevant to the review's status", () => {
      expect(container.querySelector(VERIFIED_ICON_SELECTOR)).toBeTruthy();
    });
  });

  describe("when provided an onRemove callback prop", () => {
    let onRemove;
    let container;
    let getByRole;
    beforeEach(() => {
      onRemove = jest.fn();
      const wrapper = render(
        <ModerationReviewBanner
          moderationReview={moderationReview}
          user={moderator}
          currentUser={currentUser}
          onRemove={onRemove}
        />,
      );

      container = wrapper.container;
      getByRole = wrapper.getByRole;
    });

    it("should render a button", () => {
      expect(getByRole("button")).toBeTruthy();
    });

    it("should render the button with the icon relevant to the review's status", () => {
      expect(container.querySelector(VERIFIED_ICON_SELECTOR)).toBeTruthy();
    });

    it("should render the button as a close icon when the user is hovering their mouse over the banner", () => {
      const banner = container.firstChild;
      fireEvent.mouseEnter(banner);
      expect(container.querySelector(CLOSE_ICON_SELECTOR)).toBeTruthy();
      fireEvent.mouseLeave(banner);
      expect(container.querySelector(VERIFIED_ICON_SELECTOR)).toBeTruthy();
    });

    it("should render the button as a close icon when the user focuses the button", () => {
      fireEvent.focus(getByRole("button"));
      expect(container.querySelector(CLOSE_ICON_SELECTOR)).toBeTruthy();
      fireEvent.blur(getByRole("button"));
      expect(container.querySelector(VERIFIED_ICON_SELECTOR)).toBeTruthy();
    });

    it("should render the button as a close icon when focused, even when the mouse leaves the banner", () => {
      const banner = container.firstChild;
      fireEvent.mouseEnter(banner);
      fireEvent.focus(getByRole("button"));
      expect(container.querySelector(CLOSE_ICON_SELECTOR)).toBeTruthy();
      fireEvent.mouseLeave(banner);
      expect(container.querySelector(CLOSE_ICON_SELECTOR)).toBeTruthy();
    });
  });
});
