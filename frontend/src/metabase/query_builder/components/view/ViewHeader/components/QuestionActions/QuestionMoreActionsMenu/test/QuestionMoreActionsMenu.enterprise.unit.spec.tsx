import { screen } from "__support__/ui";

import { openMenu, setupQuestionMoreActionsMenu } from "./setup";

describe("QuestionMoreActionsMenu > Enterprise", () => {
  describe("non-admins", () => {
    it('Should show the "Create an alert" menu item to non-admins if the user has subscriptions/alerts permissions', async () => {
      setupQuestionMoreActionsMenu({
        canManageSubscriptions: true,
        isAdmin: false,
        isEmailSetup: true,
        isEnterprise: true,
      });
      await openMenu();
      expect(screen.getByText("Create an alert")).toBeInTheDocument();
    });

    describe("alerts permission disabled", () => {
      it('Should not show the "Create an alert" menu item to non-admins if the user lacks subscriptions/alerts permissions', async () => {
        setupQuestionMoreActionsMenu({
          canManageSubscriptions: false,
          isAdmin: false,
          isEmailSetup: true,
          isEnterprise: true,
        });
        await openMenu();
        expect(screen.queryByText("Create an alert")).not.toBeInTheDocument();
      });
    });
  });
});
