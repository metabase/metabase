import { ModerationReviewApi } from "metabase/services";
import {
  verifyItem,
  removeReview,
  getIconForReview,
  getTextForReviewBanner,
  isItemVerified,
  getLatestModerationReview,
  getStatusIconForQuestion,
  getModerationTimelineEvents,
  getStatusIcon,
  getRemovedReviewStatusIcon,
} from "./service";

jest.mock("metabase/services", () => ({
  ModerationReviewApi: {
    create: jest.fn(() => Promise.resolve({ id: 123 })),
  },
}));

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

  describe("getStatusIcon", () => {
    it("should return an empty icon if there is no matching status", () => {
      expect(getStatusIcon("foo")).toEqual({});
    });

    it("should return an icon if there is a matching status", () => {
      expect(getStatusIcon("verified")).toEqual({
        name: "verified",
        color: "brand",
      });
    });

    it("should not return an icon for a status of null, which represents the removal of a review and is a special case", () => {
      const removedReviewStatus = null;
      const accidentallyStringCoercedRemvovedReviewStatus = "null";
      expect(getStatusIcon(removedReviewStatus)).toEqual({});
      expect(
        getStatusIcon(accidentallyStringCoercedRemvovedReviewStatus),
      ).toEqual({});
    });
  });

  describe("getRemovedReviewStatusIcon", () => {
    it("should return an icon for a removed review", () => {
      expect(getRemovedReviewStatusIcon()).toEqual({
        name: "close",
        color: "text-light",
      });
    });
  });

  describe("getIconForReview", () => {
    it("should return icon name/color for given review", () => {
      expect(getIconForReview({ status: "verified" })).toEqual(
        getStatusIcon("verified"),
      );
    });
  });

  describe("getTextForReviewBanner", () => {
    it("should return text for a verified review", () => {
      expect(getTextForReviewBanner({ status: "verified" })).toEqual({
        bannerText: "A moderator verified this",
        tooltipText: "Remove verification",
      });
    });

    it("should include the moderator name", () => {
      expect(
        getTextForReviewBanner(
          { status: "verified" },
          {
            common_name: "Foo",
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
            common_name: "Foo",
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

  describe("getStatusIconForQuestion", () => {
    it('should return the status icon for the most recent "real" review', () => {
      const questionWithReviews = {
        getModerationReviews: () => [
          { id: 1, status: "verified" },
          { id: 2, status: "verified", most_recent: true },
          { id: 3, status: null },
        ],
      };

      expect(getStatusIconForQuestion(questionWithReviews)).toEqual(
        getStatusIcon("verified"),
      );
    });

    it("should return undefined vals for no review", () => {
      const questionWithNoMostRecentReview = {
        getModerationReviews: () => [
          { id: 1, status: "verified" },
          { id: 2, status: "verified" },
          { id: 3, status: null, most_recent: true },
        ],
      };

      const questionWithNoReviews = {
        getModerationReviews: () => [],
      };

      const questionWithUndefinedReviews = {
        getModerationReviews: () => undefined,
      };

      const noIcon = { name: undefined, color: undefined };

      expect(getStatusIconForQuestion(questionWithNoMostRecentReview)).toEqual(
        noIcon,
      );
      expect(getStatusIconForQuestion(questionWithNoReviews)).toEqual(noIcon);
      expect(getStatusIconForQuestion(questionWithUndefinedReviews)).toEqual(
        noIcon,
      );
    });
  });

  describe("getModerationTimelineEvents", () => {
    it("should return the moderation timeline events", () => {
      const reviews = [
        {
          id: 1,
          status: "verified",
          created_at: "2018-01-01T00:00:00.000Z",
          moderator_id: 1,
        },
        {
          id: 2,
          status: null,
          created_at: "2018-01-02T00:00:00.000Z",
          moderator_id: 123,
        },
      ];
      const usersById = {
        1: {
          id: 1,
          common_name: "Foo",
        },
      };

      expect(getModerationTimelineEvents(reviews, usersById)).toEqual([
        {
          timestamp: reviews[0].created_at,
          icon: getStatusIcon("verified"),
          title: "Foo verified this",
        },
        {
          timestamp: reviews[1].created_at,
          icon: getRemovedReviewStatusIcon(),
          title: "A moderator removed verification",
        },
      ]);
    });
  });
});
