import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import {
  createMockCard,
  createMockModerationReview,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

const DESCRIPTION = "abc";

describe("QuestionInfoSidebar", () => {
  describe("description", () => {
    it.each([
      createMockCard({
        name: "Question",
        description: DESCRIPTION,
        type: "question",
      }),
      createMockCard({
        name: "Model",
        description: DESCRIPTION,
        type: "model",
      }),
    ])("should display description of a $name", async card => {
      await setup({ card });
      expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    });

    it("should not allow to add the description without write permissions", async () => {
      const card = createMockCard({ description: null, can_write: false });
      await setup({ card });

      expect(screen.getByPlaceholderText("No description")).toBeDisabled();
    });

    it("should not allow to edit the description without write permissions", async () => {
      const card = createMockCard({
        description: DESCRIPTION,
        can_write: false,
      });
      await setup({ card });

      // show input
      await userEvent.click(screen.getByTestId("editable-text"));

      const input = screen.getByPlaceholderText("Add description");
      expect(input).toHaveValue(card.description);
      expect(input).toBeDisabled();
    });
  });

  describe("model detail link", () => {
    it("is shown for models", async () => {
      const card = createMockCard({
        name: "abc",
        type: "model",
      });
      await setup({ card });

      const link = screen.getByText("Model details");

      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", Urls.modelDetail(card));
    });

    it("isn't shown for questions", async () => {
      const card = createMockCard({
        name: "abc",
        description: DESCRIPTION,
      });
      await setup({ card });
      expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
      expect(screen.queryByText("Model details")).not.toBeInTheDocument();
    });
  });

  describe("cache ttl", () => {
    it("should not allow to configure caching", async () => {
      const card = createMockCard({
        cache_ttl: 10,
        description: DESCRIPTION,
      });
      await setup({ card });
      expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
      expect(screen.queryByText("Cache Configuration")).not.toBeInTheDocument();
    });
  });

  describe("moderation reviews", () => {
    it("should not show the verification badge", async () => {
      const card = createMockCard({
        moderation_reviews: [
          createMockModerationReview({ status: "verified" }),
        ],
      });
      await setup({ card });
      expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
    });
  });
});
