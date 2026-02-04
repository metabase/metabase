import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockNotification } from "metabase-types/api/mocks";

import { openMenu, setup } from "./setup";

describe("QuestionMoreActionsMenu >", () => {
  describe("admins", () => {
    it("should show the 'Create an alert' menu item if no alerts exist", async () => {
      setup({
        alerts: [],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(screen.getByText("Create an alert")).toBeInTheDocument();
    });

    it("should show the 'Edit alerts' menu item if alerts exist", async () => {
      setup({
        alerts: [createMockNotification()],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(await screen.findByText("Edit alerts")).toBeInTheDocument();
    });

    it("clicking to edit alerts should open the alert popover", async () => {
      setup({
        alerts: [createMockNotification()],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      await userEvent.click(screen.getByText("Edit alerts"));
      expect(await screen.findByTestId("alert-list-modal")).toBeInTheDocument();
    });

    it("should show the 'Save screenshot' menu item", async () => {
      setup({
        alerts: [],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(screen.getByText("Save screenshot")).toBeInTheDocument();
    });
  });

  describe("non-admins", () => {
    // NOTE: canManageSubscriptions doesn't do anything here as it is always "true" for non-EE
    it("should show the 'Create an alert' menu item if no alerts exist", async () => {
      setup({
        alerts: [],
        canManageSubscriptions: false,
        isAdmin: false,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(screen.getByText("Create an alert")).toBeInTheDocument();
    });

    it("should show the 'Edit alerts' menu item if alerts exist", async () => {
      setup({
        alerts: [createMockNotification()],
        canManageSubscriptions: false,
        isAdmin: false,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(screen.getByText("Edit alerts")).toBeInTheDocument();
    });

    it("clicking to edit alerts should open the alert popover", async () => {
      setup({
        alerts: [createMockNotification()],
        canManageSubscriptions: false,
        isAdmin: false,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      await userEvent.click(screen.getByText("Edit alerts"));
      expect(await screen.findByTestId("alert-list-modal")).toBeInTheDocument();
    });
  });
});
