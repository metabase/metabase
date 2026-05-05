import { screen } from "__support__/ui";
import { createMockModerationReview } from "metabase-types/api/mocks";

import { openMenu, setup } from "./setup";

describe("QuestionMoreActionsMenu > Enterprise", () => {
  describe("non-admins", () => {
    it('Should show the "Create an alert" menu item to non-admins if the user has subscriptions/alerts permissions', async () => {
      setup({
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
        setup({
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

  describe("content verification", () => {
    it('should show "Verify this question" for admin users', async () => {
      setup({
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: false,
        isEnterprise: true,
      });
      await openMenu();
      expect(screen.getByText("Verify this question")).toBeInTheDocument();
    });

    it('should show "Remove verification" for admin users on verified questions', async () => {
      setup({
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: false,
        isEnterprise: true,
        moderationReviews: [
          createMockModerationReview({ status: "verified", most_recent: true }),
        ],
      });
      await openMenu();
      expect(screen.getByText("Remove verification")).toBeInTheDocument();
    });

    it('should not show "Verify this question" for non-admin users', async () => {
      setup({
        canManageSubscriptions: false,
        isAdmin: false,
        isEmailSetup: false,
        isEnterprise: true,
      });
      await openMenu();
      expect(
        screen.queryByText("Verify this question"),
      ).not.toBeInTheDocument();
    });
  });
});
