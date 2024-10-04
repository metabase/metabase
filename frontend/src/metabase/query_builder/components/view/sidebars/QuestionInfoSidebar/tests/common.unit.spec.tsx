import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { BaseEntityId } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
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

  describe("question details", () => {
    it("should show last edited", () => {
      const card = createMockCard({
        name: "Question",
        "last-edit-info": {
          first_name: "Ash",
          last_name: "Ketchum",
          timestamp: "2024-04-11T00:00:00Z",
          email: "Ashboy@example.com",
          id: 19,
        },
      });
      setup({ card });
      expect(screen.getByText("April 11, 2024")).toBeInTheDocument();
      expect(screen.getByText("by Ash Ketchum")).toBeInTheDocument();
    });

    it("should show creation information", () => {
      const card = createMockCard({
        name: "Question",
        creator: {
          first_name: "Ash",
          last_name: "Ketchum",
          email: "Ashboy@example.com",
          common_name: "Ash Ketchum",
          id: 19,
        },
        created_at: "2024-04-13T00:00:00Z",
      });
      setup({ card });
      expect(screen.getByText("April 13, 2024")).toBeInTheDocument();
      expect(screen.getByText("by Ash Ketchum")).toBeInTheDocument();
    });

    it("should show save location", () => {
      const card = createMockCard({
        name: "Question",
        collection: createMockCollection({ name: "My Big Collection" }),
      });
      setup({ card });

      expect(screen.getByText("My Big Collection")).toBeInTheDocument();
    });

    it("should show correct link for root collection", () => {
      const card = createMockCard({
        name: "Question",
        // @ts-expect-error - ye olde null root collection bugbear
        collection: createMockCollection({ id: null, name: "Our analytics" }),
        collection_id: null,
      });
      setup({ card });

      expect(screen.getByText("Our analytics")).toHaveAttribute(
        "href",
        "/collection/root",
      );
    });

    it("should show source information", () => {
      const card = createMockCard({
        name: "Question",
      });
      setup({ card });

      expect(screen.getByText("Sample Database")).toBeInTheDocument();
      expect(screen.getByText("/")).toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
    });

    it("should show entity id", () => {
      const card = createMockCard({
        name: "Question",
        entity_id: "jenny8675309" as BaseEntityId,
      });
      setup({ card });

      expect(screen.getByText("Entity ID")).toBeInTheDocument();
      expect(screen.getByText("jenny8675309")).toBeInTheDocument();
    });

    it("should show if a public link is enabled", () => {
      const card = createMockCard({
        name: "Question",
        public_uuid: "watch-me-please",
      });
      setup({ card });

      expect(screen.getByLabelText("globe icon")).toBeInTheDocument();
      expect(screen.getByText("Shared publicly")).toBeInTheDocument();
      expect(screen.getByLabelText("link icon")).toBeInTheDocument();
    });

    it("should show if a embedding is enabled", () => {
      const card = createMockCard({
        name: "Question",
        enable_embedding: true,
      });
      setup({ card });

      expect(screen.getByLabelText("embed icon")).toBeInTheDocument();
      expect(screen.getByText("Embedded")).toBeInTheDocument();
    });
  });

  describe("model detail link", () => {
    it("is shown for models", async () => {
      const card = createMockCard({
        name: "abc",
        type: "model",
      });
      await setup({ card });

      const link = screen.getByText("See more about this model");

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
      expect(
        screen.queryByText("See more about this model"),
      ).not.toBeInTheDocument();
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
