import { screen } from "__support__/ui";

import { openMenu, setupQuestionSharingMenu } from "./setup";

describe("QuestionNotificationsMenu > Enterprise", () => {
  it("Should show alerts and subscriptions menu items to non-admins if the user has subscriptions/alerts permissions", async () => {
    await setupQuestionSharingMenu({
      canManageSubscriptions: true,
      isEmailSetup: true,
      isEnterprise: true,
      isAdmin: false,
    });
    await openMenu();
    expect(screen.getByText("Create alerts")).toBeInTheDocument();
    expect(screen.getByText("Create subscriptions")).toBeInTheDocument();
  });

  describe("alerts permission disabled", () => {
    it('Should not show the "Create alerts" menu item to non-admins if the user lacks subscriptions/alerts permissions', async () => {
      await setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isEmailSetup: true,
        isEnterprise: true,
      });

      expect(
        screen.queryByTestId("notifications-menu-button"),
      ).not.toBeInTheDocument();
    });
  });
});
