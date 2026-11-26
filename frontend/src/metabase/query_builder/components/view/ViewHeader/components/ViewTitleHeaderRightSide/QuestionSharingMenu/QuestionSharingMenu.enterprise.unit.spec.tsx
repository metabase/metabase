import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import type { PublicLinkRefusalResponse } from "metabase-types/api";
import {
  createMockCollection,
  createMockPublicLinkRefusal,
} from "metabase-types/api/mocks";

import { openMenu, setupQuestionSharingMenu } from "./tests/setup";

describe("QuestionSharingMenu > Enterprise", () => {
  beforeEach(() => {
    jest.mocked(navigator.clipboard.writeText).mockClear();
  });

  describe("non-admins", () => {
    it("shows a sharing menu with both copy options when a public link exists", async () => {
      await setupQuestionSharingMenu({
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
      await setupQuestionSharingMenu({
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
      await setupQuestionSharingMenu({
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
      await setupQuestionSharingMenu({
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
    const REFUSED = createMockPublicLinkRefusal({
      id: 10,
      name: "Tenant warehouse",
    });
    const ALLOWED: PublicLinkRefusalResponse = { refusal: null };

    const routingExplanation =
      /Tenant warehouse has database routing enabled and does not allow anonymous access/;

    it("disables creating a public link when the server refuses one", async () => {
      await setupQuestionSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        publicLinkRefusal: REFUSED,
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

    it("offers a public link when the server allows one", async () => {
      await setupQuestionSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        publicLinkRefusal: ALLOWED,
      });
      await openMenu();

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls(
            "express:/api/public-link-refusal/:model/:id",
          ),
        ).toHaveLength(1),
      );
      await fetchMock.callHistory.flush(true);

      expect(screen.getByText("Create a public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
    });

    it("leaves an existing public link reachable, without asking, where a new one would be refused", async () => {
      await setupQuestionSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        hasPublicLink: true,
        publicLinkRefusal: REFUSED,
      });
      await openMenu();

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
      expect(
        fetchMock.callHistory.calls(
          "express:/api/public-link-refusal/:model/:id",
        ),
      ).toHaveLength(0);
    });

    it("should not allow sharing instance analytics question", async () => {
      await setupQuestionSharingMenu({
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
