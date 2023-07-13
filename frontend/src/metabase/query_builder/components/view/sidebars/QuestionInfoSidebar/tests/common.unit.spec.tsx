import userEvent from "@testing-library/user-event";
import {
  createMockCard,
  createMockModerationReview,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup } from "./setup";

describe("QuestionInfoSidebar", () => {
  describe("description", () => {
    it.each([
      createMockCard({ name: "Question", description: "abc", dataset: false }),
      createMockCard({ name: "Model", description: "abc", dataset: true }),
    ])("should display description of a $card.name", async card => {
      await setup({ card });
      expect(screen.getByText(card.description ?? "")).toBeInTheDocument();
    });

    it("should not allow to add the description without write permissions", async () => {
      const card = createMockCard({ description: null, can_write: false });
      await setup({ card });

      expect(screen.getByPlaceholderText("No description")).toBeDisabled();
    });

    it("should not allow to edit the description without write permissions", async () => {
      const card = createMockCard({ description: "abc", can_write: false });
      await setup({ card });

      // show input
      userEvent.click(screen.getByTestId("editable-text"));

      const input = screen.getByPlaceholderText("Add description");
      expect(input).toHaveValue(card.description);
      expect(input).toBeDisabled();
    });
  });

  describe("model detail link", () => {
    it("is shown for models", async () => {
      const card = createMockCard({ name: "abc", dataset: true });
      await setup({ card });

      const link = screen.getByText("Model details");

      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute(
        "href",
        `/model/${card.id}-${card.name}/detail`,
      );
    });

    it("isn't shown for questions", async () => {
      const card = createMockCard({ name: "abc", dataset: false });
      await setup({ card });
      expect(screen.queryByText("Model details")).not.toBeInTheDocument();
    });
  });

  describe("cache ttl", () => {
    it("should not allow to configure caching", async () => {
      const card = createMockCard({
        cache_ttl: 10,
        description: "abc",
      });
      await setup({ card });
      expect(screen.getByText(card.description ?? "")).toBeInTheDocument();
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
