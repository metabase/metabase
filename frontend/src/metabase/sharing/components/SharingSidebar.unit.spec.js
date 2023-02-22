import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDashboard,
  createMockActionDashboardCard,
  createMockDashboardOrderedCard,
  createMockUser,
} from "metabase-types/api/mocks";

import SharingSidebar from "./SharingSidebar";

const dashcard = createMockDashboardOrderedCard({ name: "dashcard" });
const actionDashcard = createMockActionDashboardCard({
  id: 2,
  name: "actionDashcard",
});

const user = createMockUser();

const dashboard = createMockDashboard({
  ordered_cards: [dashcard, actionDashcard],
});

function setup({ matchTestSubscriptionPayload }) {
  nock(location.origin)
    .get("/api/pulse/form_input")
    .reply(200, {
      channels: {
        email: {
          type: "email",
          name: "Email",
          allows_recipients: true,
          recipients: ["user", "email"],
          schedules: ["hourly"],
          configured: true,
        },
      },
    });

  nock(location.origin)
    .get("/api/user")
    .reply(200, {
      data: [user],
    });

  nock(location.origin)
    .get(`/api/pulse?dashboard_id=${dashboard.id}`)
    .reply(200, []);

  const sendTestSubscriptionScope = nock(location.origin)
    .post("/api/pulse/test")
    .reply(200, (_uri, body) => {
      matchTestSubscriptionPayload(body);
    });

  renderWithProviders(<SharingSidebar dashboard={dashboard} />, {
    storeInitialState: {
      dashboard: {
        dashboardId: dashboard.id,
        dashcards: {
          [dashcard.id]: dashcard,
          [actionDashcard.id]: actionDashcard,
        },
        dashboards: {
          [dashboard.id]: {
            ...dashboard,
            ordered_cards: [dashcard.id, actionDashcard.id],
          },
        },
      },
    },
  });

  return { sendTestSubscriptionScope };
}

describe("SharingSidebar", () => {
  it("should filter out actions when sending a test subscription", async () => {
    const { sendTestSubscriptionScope } = setup({
      matchTestSubscriptionPayload: payload => {
        expect(payload.cards).toHaveLength(1);
        expect(payload.cards[0].id).toEqual(dashcard.id);
      },
    });

    userEvent.click(await screen.findByText("Email it"));
    userEvent.click(
      await screen.findByPlaceholderText("Enter user names or email addresses"),
    );

    userEvent.click(
      await screen.findByText(`${user.first_name} ${user.last_name}`),
    );

    userEvent.click(await screen.findByText("Send email now"));

    await waitFor(() => expect(sendTestSubscriptionScope.isDone()).toBe(true));
  });
});
