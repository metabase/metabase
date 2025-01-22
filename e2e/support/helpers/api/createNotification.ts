import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  CardId,
  CreateAlertNotificationRequest,
  Notification,
  NotificationCardSendCondition,
  UserId,
} from "metabase-types/api";

export const createQuestionAlert = ({
  card_id = 1,
  send_once = false,
  send_condition = "has_result",
  user_id = ADMIN_USER_ID,
  cron_schedule = "0 0 9 * * ?",
}: {
  card_id: CardId;
  send_once: boolean;
  send_condition: NotificationCardSendCondition;
  user_id: UserId;
  cron_schedule: string;
}): Cypress.Chainable<Cypress.Response<Notification>> => {
  cy.log("Create a question alert");

  const body: CreateAlertNotificationRequest = {
    payload_type: "notification/card",
    payload: { card_id, send_once, send_condition },
    handlers: [
      {
        channel_type: "channel/email",
        recipients: [
          { type: "notification-recipient/user", user_id, details: null },
        ],
      },
    ],
    subscriptions: [
      {
        type: "notification-subscription/cron",
        event_name: null,
        cron_schedule,
      },
    ],
  };

  return cy.request<Notification>("POST", "/api/notification", body);
};
