import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { openMenu, setupQuestionSharingMenu } from "./setup";

describe("QuestionSharingMenu > Enterprise", () => {
  it('Should show the "Subscriptions" menu item to non-admins if the user has subscriptions/alerts permissions', async () => {
    await setupQuestionSharingMenu({
      canManageSubscriptions: true,
      isEmailSetup: true,
      isEnterprise: true,
      isAdmin: false,
    });
    await openMenu();
    expect(screen.getByText("Create alert")).toBeInTheDocument();
  });

  describe("alerts permission disabled", () => {
    it('Should not show the "Subscriptions" menu item to non-admins if the user lacks subscriptions/alerts permissions', async () => {
      await setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isEmailSetup: true,
        isEnterprise: true,
      });
      await openMenu();
      expect(screen.queryByText("Create alert")).not.toBeInTheDocument();
    });

    it('should show a "Public link" button item if public sharing is enabled and the user lacks alerts permissions', async () => {
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
        isEnterprise: true,
      });
      const sharingButton = screen.getByTestId("sharing-menu-button");

      expect(sharingButton).toBeEnabled();
      expect(sharingButton).toHaveAttribute("aria-label", "Public link");
    });

    it("clicking the sharing button should open the public link popover", async () => {
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isAdmin: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
        isEnterprise: true,
      });

      await userEvent.click(screen.getByTestId("sharing-menu-button"));

      expect(
        screen.getByTestId("public-link-popover-content"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("public-link-input")).toHaveDisplayValue(
        "http://localhost:3000/public/question/1337bad801",
      );
    });

    it("should show a 'ask your admin to create a public link' tooltip if public sharing is disabled", async () => {
      setupQuestionSharingMenu({
        isPublicSharingEnabled: false,
        hasPublicLink: true,
        canManageSubscriptions: false,
        isEnterprise: true,
      });
      const sharingButton = screen.getByTestId("sharing-menu-button");

      expect(sharingButton).toBeDisabled();
      expect(sharingButton).toHaveAttribute(
        "aria-label",
        "Ask your admin to create a public link",
      );
    });

    it("should show a 'ask your admin to create a public link' menu item if public sharing is enabled, but there is no existing public link", async () => {
      setupQuestionSharingMenu({
        isAdmin: false,
        isPublicSharingEnabled: true,
        canManageSubscriptions: false,
        hasPublicLink: false,
      });
      const sharingButton = screen.getByTestId("sharing-menu-button");

      expect(sharingButton).toBeDisabled();
      expect(sharingButton).toHaveAttribute(
        "aria-label",
        "Ask your admin to create a public link",
      );
    });
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
    expect(screen.queryByTestId("sharing-menu-button")).not.toBeInTheDocument();
  });
});
