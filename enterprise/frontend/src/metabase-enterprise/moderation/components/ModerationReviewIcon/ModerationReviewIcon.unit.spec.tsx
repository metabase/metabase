import { render, screen } from "@testing-library/react";
import _userEvent from "@testing-library/user-event";

import {
  createMockModerationReview,
  createMockUser,
} from "metabase-types/api/mocks";

import type { ModerationReviewIconProps } from "./ModerationReviewIcon";
import ModerationReviewIcon from "./ModerationReviewIcon";

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

describe("ModerationReviewIcon", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2022, 1, 7));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render correctly when moderator is loading", () => {
    const props = getProps();

    render(<ModerationReviewIcon {...props} />);

    expect(screen.getByLabelText("verified icon")).toBeInTheDocument();
  });

  it("should show a tooltip on hover when moderator is loaded", async () => {
    const props = getProps({
      review: createMockModerationReview({
        moderator_id: 1,
        created_at: "2021-01-01T20:10:30.200",
      }),
      moderator: createMockUser({ id: 1 }),
      currentUser: createMockUser({ id: 1 }),
    });

    render(<ModerationReviewIcon {...props} />);
    await userEvent.hover(screen.getByLabelText("verified icon"));

    expect(screen.getByText("You verified this")).toBeInTheDocument();
    expect(screen.getByText("a year ago")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<ModerationReviewIconProps>,
): ModerationReviewIconProps => ({
  review: createMockModerationReview(),
  currentUser: createMockUser(),
  ...opts,
});
