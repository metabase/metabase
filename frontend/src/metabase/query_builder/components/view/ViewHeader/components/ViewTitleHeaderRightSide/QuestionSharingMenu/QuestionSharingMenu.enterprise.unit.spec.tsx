import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import {
  createMockCollection,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { openMenu, setupQuestionSharingMenu } from "./tests/setup";

describe("QuestionSharingMenu > Enterprise", () => {
  beforeEach(() => {
    jest.mocked(navigator.clipboard.writeText).mockClear();
  });

  describe("non-admins", () => {
    it("shows a sharing menu with both copy options when a public link exists", async () => {
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
        isEnterprise: true,
      });
      expect(screen.getByTestId("sharing-menu-button")).toHaveAttribute(
        "aria-label",
        "Share",
      );
      await openMenu();
      expect(screen.getByText("Copy link")).toBeInTheDocument();
      expect(screen.getByText("Copy public link")).toBeInTheDocument();
    });

    it("copies the public link from the menu instead of opening a popover", async () => {
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
        isEnterprise: true,
      });

      await openMenu();
      await userEvent.click(screen.getByText("Copy public link"));

      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          "http://localhost:3000/public/question/1337bad801",
        ),
      );
      expect(
        screen.queryByTestId("public-link-popover-content"),
      ).not.toBeInTheDocument();
    });

    it("copies the app link directly without an admin prompt when public sharing is disabled", async () => {
      setupQuestionSharingMenu({
        isPublicSharingEnabled: false,
        hasPublicLink: true,
        canManageSubscriptions: false,
        isEnterprise: true,
      });
      const sharingButton = screen.getByTestId("sharing-menu-button");

      expect(sharingButton).toHaveAttribute("aria-label", "Copy link");
      await userEvent.click(sharingButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "http://localhost:3000/question/1-my-cool-question",
      );
      expect(
        screen.queryByText("Ask your admin to create a public link"),
      ).not.toBeInTheDocument();
    });

    it("copies the app link directly without an admin prompt when there is no public link", async () => {
      setupQuestionSharingMenu({
        isPublicSharingEnabled: true,
        canManageSubscriptions: false,
        hasPublicLink: false,
      });
      const sharingButton = screen.getByTestId("sharing-menu-button");

      expect(sharingButton).toHaveAttribute("aria-label", "Copy link");
      await userEvent.click(sharingButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "http://localhost:3000/question/1-my-cool-question",
      );
      expect(
        screen.queryByText("Ask your admin to create a public link"),
      ).not.toBeInTheDocument();
    });
  });

  describe("admins", () => {
    const ROUTED_DATABASE = createMockDatabase({
      id: 10,
      name: "Tenant warehouse",
      router_user_attribute: "tenant",
      router_anonymous_access_granted: false,
    });
    const GRANTED_DATABASE = createMockDatabase({
      ...ROUTED_DATABASE,
      router_anonymous_access_granted: true,
    });
    const PLAIN_DATABASE = createMockDatabase({ id: 10, name: "Warehouse" });

    const routingExplanation =
      /Tenant warehouse has database routing turned on and does not allow anonymous access/;

    it("disables creating a public link on a routed database that refuses anonymous access", async () => {
      await setupQuestionSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        question: { database_id: ROUTED_DATABASE.id },
        databases: [ROUTED_DATABASE],
      });
      await openMenu();

      expect(await screen.findByText(routingExplanation)).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Create a public link/ }),
      ).toHaveAttribute("data-disabled", "true");
      expect(
        screen.getByRole("link", { name: "Allow anonymous access" }),
      ).toHaveAttribute("href", "/admin/databases/10");

      await userEvent.click(screen.getByText("Create a public link"));
      expect(
        screen.queryByTestId("public-link-popover-content"),
      ).not.toBeInTheDocument();
    });

    it("creates a public link once an admin allows anonymous access", async () => {
      await setupQuestionSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        question: { database_id: GRANTED_DATABASE.id },
        databases: [GRANTED_DATABASE],
      });
      await openMenu();

      expect(screen.getByText("Create a public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
    });

    it("creates a public link on a database that is not routed", async () => {
      await setupQuestionSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        question: { database_id: PLAIN_DATABASE.id },
        databases: [PLAIN_DATABASE],
      });
      await openMenu();

      expect(screen.getByText("Create a public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
    });

    // A link minted before routing was turned on is dead, and the popover is
    // where it gets removed, so the item has to stay reachable.
    it("leaves an existing public link reachable on a routed database", async () => {
      await setupQuestionSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        hasPublicLink: true,
        question: { database_id: ROUTED_DATABASE.id },
        databases: [ROUTED_DATABASE],
      });
      await openMenu();

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
    });

    it("should not allow sharing instance analytics question", async () => {
      setupQuestionSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEmbeddingEnabled: true,
        isEnterprise: true,
        question: {
          name: "analysis",
          collection: createMockCollection({
            id: 198,
            name: "Analytics",
            type: "instance-analytics",
          }),
        },
      });
      expect(
        screen.queryByTestId("sharing-menu-button"),
      ).not.toBeInTheDocument();
    });
  });
});
