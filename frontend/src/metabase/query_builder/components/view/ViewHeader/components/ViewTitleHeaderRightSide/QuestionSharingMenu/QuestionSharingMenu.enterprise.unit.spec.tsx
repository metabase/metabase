import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

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
