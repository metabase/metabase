import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import {
  createMockNotification,
  createMockNotificationHandlerSlack,
} from "metabase-types/api/mocks";

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
      expect(await screen.findByText("Create an alert")).toBeInTheDocument();
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
      await userEvent.click(await screen.findByText("Edit alerts"));
      expect(await screen.findByTestId("alert-list-modal")).toBeInTheDocument();
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
      expect(await screen.findByText("Create an alert")).toBeInTheDocument();
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
      expect(await screen.findByText("Edit alerts")).toBeInTheDocument();
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
      await userEvent.click(await screen.findByText("Edit alerts"));
      expect(await screen.findByTestId("alert-list-modal")).toBeInTheDocument();
    });
  });

  describe("models (metabase#37893)", () => {
    it("should not offer alerts for a model", async () => {
      setup({
        cardType: "model",
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();

      const menu = await screen.findByRole("menu");
      expect(
        within(menu).getByText("Turn back to saved question"),
      ).toBeInTheDocument();
      expect(
        within(menu).queryByText("Create an alert"),
      ).not.toBeInTheDocument();
      expect(within(menu).queryByText("Edit alerts")).not.toBeInTheDocument();
      expect(within(menu).queryByText("Loading…")).not.toBeInTheDocument();
    });

    it("should not offer alerts for a model that has alerts", async () => {
      setup({
        cardType: "model",
        alerts: [createMockNotification()],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();

      const menu = await screen.findByRole("menu");
      expect(
        within(menu).getByText("Turn back to saved question"),
      ).toBeInTheDocument();
      expect(
        within(menu).queryByText("Create an alert"),
      ).not.toBeInTheDocument();
      expect(within(menu).queryByText("Edit alerts")).not.toBeInTheDocument();
      expect(within(menu).queryByText("Loading…")).not.toBeInTheDocument();
    });
  });

  describe("dashboard questions", () => {
    it("should create an alert for a question saved in a dashboard and then list it", async () => {
      const { card } = setup({
        dashboardId: 5,
        withCreateAlertEndpoint: true,
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });

      await openMenu(/Move, duplicate, and more/);
      await userEvent.click(await screen.findByText("Create an alert"));

      expect(await screen.findByText("New alert")).toBeInTheDocument();
      await userEvent.click(screen.getByTestId("select-time"));
      await userEvent.click(screen.getByRole("option", { name: "8:00" }));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      await waitFor(() => {
        expect(screen.queryByText("New alert")).not.toBeInTheDocument();
      });
      const [createCall] = fetchMock.callHistory.calls(
        "path:/api/notification",
        { method: "POST" },
      );
      expect(JSON.parse(String(createCall.options.body))).toMatchObject({
        payload: { card_id: card.id },
      });

      await openMenu(/Move, duplicate, and more/);
      await userEvent.click(await screen.findByText("Edit alerts"));

      const listModal = await screen.findByTestId("alert-list-modal");
      expect(within(listModal).getByText("Edit alerts")).toBeInTheDocument();
      expect(within(listModal).getByText(/Created by you/)).toBeInTheDocument();
    });
  });

  describe("deleting an alert (metabase#48402)", () => {
    it("should not mention email in the delete confirmation of a Slack alert", async () => {
      setup({
        alerts: [
          createMockNotification({
            handlers: [createMockNotificationHandlerSlack()],
          }),
        ],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      await userEvent.click(await screen.findByText("Edit alerts"));

      const listModal = await screen.findByTestId("alert-list-modal");
      expect(within(listModal).getByText("Edit alerts")).toBeInTheDocument();
      expect(within(listModal).getByText(/Created by you/)).toBeInTheDocument();
      await userEvent.click(
        within(listModal).getByRole("button", { name: "Delete this alert" }),
      );

      const deleteModal = await screen.findByTestId("alert-delete");
      expect(
        within(deleteModal).getByText("Delete this alert?"),
      ).toBeInTheDocument();
      expect(
        within(deleteModal).getByText("This can't be undone."),
      ).toBeInTheDocument();
      expect(within(deleteModal).queryByText(/email/i)).not.toBeInTheDocument();
      expect(
        within(deleteModal).getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
      expect(
        within(deleteModal).getByRole("button", { name: "Delete it" }),
      ).toBeInTheDocument();
    });
  });
});
