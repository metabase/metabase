import { screen } from "__support__/ui";

import { setupQuestionSharingMenu, waitForAlertsListLoaded } from "./setup";

describe("QuestionNotificationsMenu > Enterprise", () => {
  it("Should show alerts action button to non-admins if the user has subscriptions/alerts permissions", async () => {
    const { cardId } = setupQuestionSharingMenu({
      canManageSubscriptions: true,
      isEmailSetup: true,
      isEnterprise: true,
      isAdmin: false,
    });

    await waitForAlertsListLoaded(cardId);

    expect(screen.getByLabelText("Create an alert")).toBeInTheDocument();
  });

  it('Should not show the "Create alerts" menu item to non-admins if the user lacks subscriptions/alerts permissions', async () => {
    setupQuestionSharingMenu({
      canManageSubscriptions: false,
      isEmailSetup: true,
      isEnterprise: true,
    });

    expect(
      screen.queryByTestId("notifications-menu-button"),
    ).not.toBeInTheDocument();
  });
});
