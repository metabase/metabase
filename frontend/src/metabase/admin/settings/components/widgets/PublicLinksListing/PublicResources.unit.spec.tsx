import {
  setupListPublicActionsEndpoint,
  setupListPublicCardsEndpoint,
  setupListPublicDashboardsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  GetPublicAction,
  GetPublicCard,
  GetPublicDashboard,
} from "metabase-types/api";

import {
  PublicLinksActionListing,
  PublicLinksDashboardListing,
  PublicLinksQuestionListing,
} from "./PublicResources";

describe("PublicResources", () => {
  describe("PublicLinksActionListing", () => {
    const setupActionListing = async (actions: GetPublicAction[]) => {
      setupListPublicActionsEndpoint(actions);
      renderWithProviders(<PublicLinksActionListing />);
    };

    it("should show empty state when no actions", async () => {
      setupActionListing([]);
      await waitFor(() => {
        expect(
          screen.getByText("No actions have been publicly shared yet."),
        ).toBeInTheDocument();
      });
    });

    it("should render action listings when loaded", async () => {
      setupActionListing([
        {
          id: 1,
          name: "Test Action 1",
          model_id: 1,
          public_uuid: "e4f2be29-78df-4c35-9cc4-98d04091ff13",
        },
        {
          id: 2,
          name: "Test Action 2",
          model_id: 1,
          public_uuid: "e4f2be29-78df-4c35-9cc4-98d04091ff13",
        },
        {
          id: 3,
          name: "Test Action 3",
          model_id: 1,
          public_uuid: "e4f2be29-78df-4c35-9cc4-98d04091ff13",
        },
      ]);

      await waitFor(() => {
        ["Test Action 1", "Test Action 2", "Test Action 3"].forEach((name) =>
          expect(screen.getByText(name)).toBeInTheDocument(),
        );
      });

      const rows = screen.getAllByRole("row");
      expect(rows).toHaveLength(4); // Header + 3 rows
    });
  });

  describe("PublicLinksQuestionListing", () => {
    const setupQuestion = async (cards: GetPublicCard[]) => {
      setupListPublicCardsEndpoint(cards);
      renderWithProviders(<PublicLinksQuestionListing />);
    };

    it("should show empty state when no questions", async () => {
      setupQuestion([]);
      await waitFor(() => {
        expect(
          screen.getByText("No questions have been publicly shared yet."),
        ).toBeInTheDocument();
      });
    });

    it("should render question listings when loaded", async () => {
      setupQuestion([
        {
          name: "Test Question 1",
          id: 1,
          public_uuid: "11bf0e18-34d2-4630-865a-c0bebb75c8b3",
        },
        {
          name: "Test Question 2",
          id: 2,
          public_uuid: "502876cd-da65-4e72-a60f-253584548940",
        },
        {
          name: "Test Question 3",
          id: 3,
          public_uuid: "5bec9624-3102-428a-8b9f-47c56bd96c6c",
        },
      ]);

      await waitFor(() => {
        ["Test Question 1", "Test Question 2", "Test Question 3"].forEach(
          (name) => expect(screen.getByText(name)).toBeInTheDocument(),
        );
      });

      const rows = screen.getAllByRole("row");
      expect(rows).toHaveLength(4); // Header + 3 rows
    });
  });

  describe("PublicLinksDashboardListing", () => {
    const setupDashboardListing = async (dashboards: GetPublicDashboard[]) => {
      setupListPublicDashboardsEndpoint(dashboards);
      renderWithProviders(<PublicLinksDashboardListing />);
    };

    it("should show empty state when no dashboards", async () => {
      setupDashboardListing([]);
      await waitFor(() => {
        expect(
          screen.getByText("No dashboards have been publicly shared yet."),
        ).toBeInTheDocument();
      });
    });

    it("should render dashboard listings when loaded", async () => {
      setupDashboardListing([
        {
          name: "Test Dashboard 1",
          id: 1,
          public_uuid: "16a4568d-c328-4306-9c4b-ec8fbd6e4c8e",
        },
        {
          name: "Test Dashboard 2",
          id: 2,
          public_uuid: "9c92a915-1a78-4455-a99c-c973032960fb",
        },
        {
          name: "Test Dashboard 3",
          id: 3,
          public_uuid: "2b80845e-0ff4-4182-8a9a-083cc904f5dd",
        },
      ]);

      await waitFor(() => {
        ["Test Dashboard 1", "Test Dashboard 2", "Test Dashboard 3"].forEach(
          (name) => expect(screen.getByText(name)).toBeInTheDocument(),
        );
      });

      const rows = screen.getAllByRole("row");
      expect(rows).toHaveLength(4); // Header + 3 rows
    });
  });
});
