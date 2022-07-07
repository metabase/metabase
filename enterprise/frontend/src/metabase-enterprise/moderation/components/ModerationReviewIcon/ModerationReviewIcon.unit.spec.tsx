import React from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockModerationReview,
  createMockUser,
} from "metabase-types/api/mocks";
import ModerationReviewIcon, {
  ModerationReviewIconProps,
} from "./ModerationReviewIcon";
import userEvent from "@testing-library/user-event";

describe("ModerationReviewIcon", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2022, 6, 7));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render correctly when moderator is loading", () => {
    const props = getProps({
      currentUser: createMockUser({ id: 1 }),
    });

    render(<ModerationReviewIcon {...props} />);

    expect(screen.getByLabelText("verified icon")).toBeInTheDocument();
  });

  it("should show a tooltip on hover when moderator is loaded", () => {
    const props = getProps({
      currentUser: createMockUser({ id: 1 }),
      moderator: createMockUser({ id: 1 }),
    });

    render(<ModerationReviewIcon {...props} />);
    userEvent.hover(screen.getByLabelText("verified icon"));

    expect(screen.getByText("You verified this")).toBeInTheDocument();
    expect(screen.getByText("8 years ago")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<ModerationReviewIconProps>,
): ModerationReviewIconProps => ({
  review: createMockModerationReview(),
  currentUser: createMockUser(),
  ...opts,
});
