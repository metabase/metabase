import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { setupQuestionSharingMenu } from "./tests/setup";

describe("QuestionSharingMenu > Enterprise", () => {
  describe("non-admins", () => {
    it('turns the share button into a "Copy link" action when a public link exists', async () => {
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
        isEnterprise: true,
      });
      const sharingButton = screen.getByTestId("sharing-menu-button");

      expect(sharingButton).toBeEnabled();
      expect(sharingButton).toHaveAttribute("aria-label", "Copy link");
    });

    it("clicking the share button copies the public link directly instead of opening a popover", async () => {
      jest.mocked(navigator.clipboard.writeText).mockClear();
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
        isEnterprise: true,
      });

      await userEvent.click(screen.getByTestId("sharing-menu-button"));

      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          "http://localhost:3000/public/question/1337bad801",
        ),
      );
      expect(
        screen.queryByTestId("public-link-popover-content"),
      ).not.toBeInTheDocument();
    });

    it("hides the share button without an admin prompt when public sharing is disabled", async () => {
      setupQuestionSharingMenu({
        isPublicSharingEnabled: false,
        hasPublicLink: true,
        canManageSubscriptions: false,
        isEnterprise: true,
      });

      expect(
        screen.queryByTestId("sharing-menu-button"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Ask your admin to create a public link"),
      ).not.toBeInTheDocument();
    });

    it("hides the share button without an admin prompt when there is no public link", async () => {
      setupQuestionSharingMenu({
        isPublicSharingEnabled: true,
        canManageSubscriptions: false,
        hasPublicLink: false,
      });

      expect(
        screen.queryByTestId("sharing-menu-button"),
      ).not.toBeInTheDocument();
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
