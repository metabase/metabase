import { verifyItem } from "./service";

jest.mock("metabase/services", () => ({
  ModerationReviewApi: {
    create: jest.fn(() => Promise.resolve({ id: 1 })),
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
        status: "foo",
        itemId: 123,
        itemType: "card",
        text: "bar",
      });

      expect(ModerationReviewApi.create).toHaveBeenCalledWith({
        status: "foo",
        moderated_item_id: 123,
        moderated_item_type: "card",
        text: "bar",
      });

      expect(review).toEqual({ id: 1 });
    });
  });
});
