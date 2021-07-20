import {
  verifyItem,
  removeReview,
  getVerifiedIcon,
  getIconForReview,
  getTextForReviewBanner,
  isItemVerified,
  getLatestModerationReview,
  getStatusIconForReviews,
} from "./service";

jest.mock("metabase/services", () => ({
  ModerationReviewApi: {
    create: jest.fn(() => Promise.resolve({ id: 123 })),
  },
}));

import { ModerationReviewApi } from "metabase/services";

describe("moderation/service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("verifyItem", () => {
    it("should create a new moderation review", async () => {
      const review = await verifyItem({
        itemId: 123,
        itemType: "card",
        text: "bar",
      });

      expect(ModerationReviewApi.create).toHaveBeenCalledWith({
        status: "verified",
        moderated_item_id: 123,
        moderated_item_type: "card",
        text: "bar",
      });

      expect(review).toEqual({ id: 123 });
    });
  });

  describe("removeReview", () => {
    it("should create a new moderation review with a null status", async () => {
      const review = await removeReview({
        itemId: 123,
        itemType: "card",
      });

      expect(ModerationReviewApi.create).toHaveBeenCalledWith({
        status: null,
        moderated_item_id: 123,
        moderated_item_type: "card",
      });

      expect(review).toEqual({ id: 123 });
    });
  });

  describe("getVerifiedIcon", () => {
    it("should return verified icon name/color", () => {
      expect(getVerifiedIcon()).toEqual({
        icon: "verified",
        iconColor: "brand",
      });
    });
  });

  describe("getIconForReview", () => {
    it("should return icon name/color for given review", () => {
      expect(getIconForReview({ status: "verified" })).toEqual(
        getVerifiedIcon(),
      );
    });

    it("should be an empty object for a null review", () => {
      expect(getIconForReview({ status: null })).toEqual({});
    });
  });

  describe("getTextForReviewBanner", () => {
    it("should return text for a verified review", () => {
      expect(getTextForReviewBanner({ status: "verified" })).toEqual({
        bannerText: "Someone verified this",
        tooltipText: "Remove verification",
      });
    });

    it("should include the moderator name", () => {
      expect(
        getTextForReviewBanner(
          { status: "verified" },
          {
            display_name: "Foo",
            id: 1,
          },
          { id: 2 },
        ),
      ).toEqual({
        bannerText: "Foo verified this",
        tooltipText: "Remove verification",
      });
    });

    it("should handle the moderator being the current user", () => {
      expect(
        getTextForReviewBanner(
          { status: "verified" },
          {
            display_name: "Foo",
            id: 1,
          },
          { id: 1 },
        ),
      ).toEqual({
        bannerText: "You verified this",
        tooltipText: "Remove verification",
      });
    });
  });

  describe("isItemVerified", () => {
    it("should return true for a verified review", () => {
      expect(isItemVerified({ status: "verified" })).toBe(true);
    });

    it("should return false for a null review", () => {
      expect(isItemVerified({ status: null })).toBe(false);
    });

    it("should return false for no review", () => {
      expect(isItemVerified()).toBe(false);
    });
  });

  describe("getLatestModerationReview", () => {
    it("should return the review flagged as most recent", () => {
      const reviews = [
        { id: 1, status: "verified" },
        { id: 2, status: "verified", most_recent: true },
        { id: 3, status: null },
      ];

      expect(getLatestModerationReview(reviews)).toEqual({
        id: 2,
        status: "verified",
        most_recent: true,
      });
    });

    it("should return undefined when there is no review flagged as most recent", () => {
      const reviews = [
        { id: 1, status: "verified" },
        { id: 2, status: "verified" },
        { id: 3, status: null },
      ];

      expect(getLatestModerationReview(reviews)).toEqual(undefined);
      expect(getLatestModerationReview([])).toEqual(undefined);
    });

    it("should return undefined when there is a review with a status of null flagged as most recent", () => {
      const reviews = [
        { id: 1, status: "verified" },
        { id: 2, status: "verified" },
        { id: 3, status: null, most_recent: true },
      ];

      expect(getLatestModerationReview(reviews)).toEqual(undefined);
    });
  });
});

describe("getStatusIconForReviews", () => {
  it('should return the status icon for the most recent "real" review', () => {
    const reviews = [
      { id: 1, status: "verified" },
      { id: 2, status: "verified", most_recent: true },
      { id: 3, status: null },
    ];

    expect(getStatusIconForReviews(reviews)).toEqual(getVerifiedIcon());
  });

  it("should return undefined for no review", () => {
    const reviews = [
      { id: 1, status: "verified" },
      { id: 2, status: "verified" },
      { id: 3, status: null, most_recent: true },
    ];

    expect(getLatestModerationReview(reviews)).toEqual(undefined);
    expect(getLatestModerationReview([])).toEqual(undefined);
  });
});
