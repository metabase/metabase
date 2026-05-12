import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import { createMockNotification } from "metabase-types/api/mocks/notification";

import type { SetupOpts } from "./constants.spec";

type Setup = (opts?: SetupOpts) => Promise<void>;

async function findModal() {
  return await screen.findByRole("dialog");
}

export function addAlertModalTests(
  setup: Setup,
  { userId }: { userId: number },
) {
  describe("alert modal", () => {
    it("should show alert list modal when there are existing alerts", async () => {
      await setup({
        withAlerts: true,
        isEmailSetup: true,
        canManageSubscriptions: true,
        isModel: false,
        enterprisePlugins: ["sdk_notifications"],
        notifications: [createMockNotification()],
      });

      expect(
        within(screen.getByRole("gridcell")).getByText("Test Row"),
      ).toBeVisible();

      await userEvent.click(
        await screen.findByRole("button", { name: "Alerts" }),
      );

      // Verify the alert list modal appears, not the create modal
      const withinModal = within(await findModal());

      // Show the alert list modal title
      expect(
        await withinModal.findByRole("heading", { name: "Edit alerts" }),
      ).toBeVisible();

      // Should show the button to create a new alert in the list modal
      expect(withinModal.getByText("New alert")).toBeVisible();

      // Should NOT show the create alert form fields
      expect(
        withinModal.queryByText("What do you want to be alerted about?"),
      ).not.toBeInTheDocument();
    });

    it("should not show email selector on the SDK and use current logged in user as the recipient", async () => {
      await setup({
        withAlerts: true,
        isEmailSetup: true,
        canManageSubscriptions: true,
        isModel: false,
        enterprisePlugins: ["sdk_notifications"],
      });

      expect(
        within(screen.getByRole("gridcell")).getByText("Test Row"),
      ).toBeVisible();
      await userEvent.click(
        await screen.findByRole("button", { name: "Alerts" }),
      );

      const withinModal = within(await findModal());
      expect(
        withinModal.getByRole("heading", { name: "New alert" }),
      ).toBeVisible();
      expect(
        withinModal.getByText("What do you want to be alerted about?"),
      ).toBeVisible();
      expect(
        withinModal.getByText("When do you want to check this?"),
      ).toBeVisible();
      // Email selector is within this section, checking only the header is fine
      expect(
        withinModal.queryByText("Where do you want to send the results?"),
      ).not.toBeInTheDocument();
      expect(withinModal.getByText("More options")).toBeVisible();
      await userEvent.click(withinModal.getByRole("button", { name: "Done" }));

      const createNotificationRequest = (await findRequests("POST")).find(
        (postRequest) =>
          postRequest.url === "http://localhost/api/notification",
      );
      // Checks that we're using the current logged in user as the sole recipient
      expect(createNotificationRequest?.body).toMatchObject({
        handlers: [
          {
            channel_type: "channel/email",
            recipients: [
              {
                details: null,
                type: "notification-recipient/user",
                user_id: userId,
              },
            ],
          },
        ],
      });
      // So that when we assert this value, we know we won't accidentally match the default mock ID
      expect(userId).not.toBe(1);
    });
  });
}
