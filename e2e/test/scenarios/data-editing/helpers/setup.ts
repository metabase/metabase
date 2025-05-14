import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";

export const setupAlert = (tableId: number, eventName: string) => {
  cy.request("POST", "/api/notification", {
    payload_type: "notification/system-event",
    payload: { event_name: eventName, table_id: tableId },
    payload_id: null,
    handlers: [
      {
        channel_type: "channel/email",
        recipients: [
          {
            type: "notification-recipient/user",
            user_id: ADMIN_USER_ID,
            details: null,
          },
        ],
      },
    ],
    condition: [
      "and",
      ["=", ["context", "table_id"], tableId],
      ["=", ["context", "event_name"], eventName],
    ],
  });
};
