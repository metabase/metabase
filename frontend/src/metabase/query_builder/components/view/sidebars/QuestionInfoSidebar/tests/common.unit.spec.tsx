import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDashboardEndpoints } from "__support__/server-mocks";
import { testDataset } from "__support__/testDataset";
import { screen, within } from "__support__/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { BaseEntityId } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockModerationReview,
  createMockSettings,
  createMockTokenFeatures,
  createMockUserInfo,
} from "metabase-types/api/mocks";
import { ORDERS_ID, PRODUCTS_ID } from "metabase-types/api/mocks/presets";

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
    ])("should display description of a $name", async (card) => {
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

  describe("sections", () => {
    it("shows one column of sections instead of tabs", async () => {
      await setup({});

      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      ["Description", "Details", "Linked tables", "History"].forEach(
        (title) => {
          expect(screen.getByText(title)).toBeInTheDocument();
        },
      );
    });

    it("shows no Insights action for non-admins", async () => {
      await setup({});

      expect(
        screen.queryByRole("button", { name: "Insights" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Insights" }),
      ).not.toBeInTheDocument();
    });

    it("opens the usage analytics upsell from the Insights action for admins", async () => {
      await setup({
        user: { is_superuser: true },
        settings: createMockSettings({
          "token-features": createMockTokenFeatures({
            audit_app: false,
          }),
        }),
      });

      await userEvent.click(screen.getByRole("button", { name: "Insights" }));

      expect(
        await screen.findByText(/See who.s doing what, when/),
      ).toBeInTheDocument();
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
        creator: createMockUserInfo({
          first_name: "Ash",
          last_name: "Ketchum",
          email: "Ashboy@example.com",
          common_name: "Ash Ketchum",
          id: 19,
        }),
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

    it("should link a dashboard question to its dashboard without fetching it", async () => {
      const dashboard = { id: 5, name: "My Dashboard" };
      const card = createMockCard({
        name: "Question",
        dashboard_id: dashboard.id,
        dashboard,
        collection: createMockCollection({ name: "My Big Collection" }),
      });
      await setup({ card });

      expect(screen.getByText("My Dashboard")).toHaveAttribute(
        "href",
        Urls.dashboard(dashboard),
      );
      expect(screen.queryByText("My Big Collection")).not.toBeInTheDocument();
      expect(fetchMock.callHistory.called("path:/api/dashboard/5")).toBe(false);
    });

    it("should fetch the dashboard when the card does not carry it", async () => {
      const dashboard = createMockDashboard({ id: 5, name: "My Dashboard" });
      setupDashboardEndpoints(dashboard);
      const { dashboard: _hydrated, ...card } = createMockCard({
        name: "Question",
        dashboard_id: dashboard.id,
        collection: createMockCollection({ name: "My Big Collection" }),
      });
      await setup({ card });

      expect(await screen.findByText("My Dashboard")).toHaveAttribute(
        "href",
        Urls.dashboard(dashboard),
      );
    });

    it("should fall back to the collection when the dashboard request fails", async () => {
      fetchMock.get("path:/api/dashboard/5", 404);
      const card = createMockCard({
        name: "Question",
        dashboard_id: 5,
        dashboard: null,
        collection: createMockCollection({ name: "My Big Collection" }),
      });
      await setup({ card });

      expect(await screen.findByText("My Big Collection")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
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

    it("should not show entity id", () => {
      const card = createMockCard({
        name: "Question",
        // Unjustified type cast. FIXME
        entity_id: "jenny8675309" as BaseEntityId,
      });
      setup({ card });

      expect(screen.queryByText("Entity ID info")).not.toBeInTheDocument();
      expect(screen.queryByText("jenny8675309")).not.toBeInTheDocument();
    });

    it("should show if a public link is enabled", () => {
      const card = createMockCard({
        name: "Question",
        public_uuid: "watch-me-please",
      });
      setup({ card });

      expect(screen.getByText("Visibility")).toBeInTheDocument();
      expect(screen.getByText("Shared publicly")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Public link" }),
      ).toBeInTheDocument();
    });

    it("should show if a embedding is enabled", () => {
      const card = createMockCard({
        name: "Question",
        enable_embedding: true,
      });
      setup({ card });

      expect(screen.getByText("Visibility")).toBeInTheDocument();
      expect(screen.getByText("Embedded")).toBeInTheDocument();
    });

    it("should show fields", async () => {
      const card = createMockCard({
        name: "Question",
      });
      await setup({ card });

      // The card should use these columns
      const expectedColumns = testDataset.cols;
      const expectedFieldCount = expectedColumns.length;

      const cardWithFields = await screen.findByLabelText(
        new RegExp(`${expectedFieldCount} fields`),
      );
      expect(cardWithFields).toBeInTheDocument();

      // Expect the correct number of fields
      const listItems = await within(cardWithFields).findAllByRole("listitem");
      expect(listItems).toHaveLength(expectedFieldCount);

      // Expect the correct field names
      const expectedFieldNames = expectedColumns.map((col) => col.display_name);
      expectedFieldNames.forEach((expectedFieldName) => {
        expect(
          within(cardWithFields).getByText(expectedFieldName),
        ).toBeInTheDocument();
      });
    });
  });

  describe("actions link", () => {
    it("is shown for models", async () => {
      const card = createMockCard({
        name: "abc",
        type: "model",
      });
      await setup({ card });

      const link = await screen.findByRole("link", { name: /Actions/ });
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
        screen.queryByRole("link", { name: "Actions" }),
      ).not.toBeInTheDocument();
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

  describe("linked tables", () => {
    it("should show joined tables for a model (metabase#57469)", async () => {
      const query = getJoinedQuery();
      const card = createMockCard({
        type: "model",
        dataset_query: Lib.toJsQuery(query),
      });
      await setup({ card });

      expect(screen.getByText("Linked tables")).toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
    });
  });
});

function getJoinedQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        joins: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            strategy: "left-join",
            conditions: [
              {
                operator: "=",
                left: {
                  type: "column",
                  name: "PRODUCT_ID",
                },
                right: { type: "column", name: "ID" },
              },
            ],
          },
        ],
      },
    ],
  });
}
