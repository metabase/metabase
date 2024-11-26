import { screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { openMenu, setupQuestionSharingMenu } from "./setup";

describe("QuestionSharingMenu > Enterprise", () => {
  it('Should show the "Subscriptions" menu item to non-admins if the user has subscriptions/alerts permissions', async () => {
    await setupQuestionSharingMenu({
      canManageSubscriptions: true,
      isEmailSetup: true,
      isEnterprise: true,
    });
    await openMenu();
    expect(screen.getByText("Create alert")).toBeInTheDocument();
  });

  describe("alerts permission disabled", () => {
    it('should not show the "Subscriptions" menu item to non-admins if the user lacks alerts permissions', async () => {
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isEmailSetup: true,
        isEnterprise: true,
      });
      await openMenu();

      expect(screen.queryByText("Create alert")).not.toBeInTheDocument();
    });

    it('should not show the "Subscriptions" menu item if public sharing is enabled and the user lacks alerts permissions', async () => {
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
        isEnterprise: true,
      });
      await openMenu();

      expect(screen.queryByText("Create alert")).not.toBeInTheDocument();
    });

    it('should not show the "Subscriptions" menu item if public sharing is disabled', async () => {
      setupQuestionSharingMenu({
        isPublicSharingEnabled: false,
        hasPublicLink: true,
        canManageSubscriptions: false,
        isEnterprise: true,
      });
      await openMenu();

      expect(screen.queryByText("Create alert")).not.toBeInTheDocument();
    });

    it('should not show the "Subscriptions" menu item if public sharing is enabled, but there is no existing public link', async () => {
      setupQuestionSharingMenu({
        isPublicSharingEnabled: true,
        canManageSubscriptions: false,
        hasPublicLink: false,
      });
      await openMenu();

      expect(screen.queryByText("Create alert")).not.toBeInTheDocument();
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
