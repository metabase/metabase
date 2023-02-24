import React from "react";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDashboard,
  createMockActionDashboardCard,
  createMockDashboardOrderedCard,
  createMockUser,
  createMockCard,
} from "metabase-types/api/mocks";

import SharingSidebar from "./SharingSidebar";

const dashcard = createMockDashboardOrderedCard({ name: "dashcard" });
const actionDashcard = createMockActionDashboardCard({
  id: 2,
  name: "actionDashcard",
});
const linkDashcard = createMockActionDashboardCard({
  id: 3,
  name: "linkDashcard",
  card: createMockCard({ display: "link" }),
});

const user = createMockUser();

const dashboard = createMockDashboard({
  ordered_cards: [dashcard, actionDashcard, linkDashcard],
});

function setup() {
  fetchMock.get("path:/api/pulse/form_input", {
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

  fetchMock.get("path:/api/user", {
    data: [user],
  });

  fetchMock.get(
    { url: `path:/api/pulse`, query: { dashboard_id: dashboard.id } },
    [],
  );

  fetchMock.post("path:/api/pulse/test", 200);

  renderWithProviders(<SharingSidebar dashboard={dashboard} />, {
    storeInitialState: {
      dashboard: {
        dashboardId: dashboard.id,
        dashcards: {
          [dashcard.id]: dashcard,
          [actionDashcard.id]: actionDashcard,
          [linkDashcard.id]: linkDashcard,
        },
        dashboards: {
          [dashboard.id]: {
            ...dashboard,
            ordered_cards: [dashcard.id, actionDashcard.id, linkDashcard.id],
          },
        },
      },
    },
  });
}

describe("SharingSidebar", () => {
  it("should filter out actions and links when sending a test subscription", async () => {
    setup();

    userEvent.click(await screen.findByText("Email it"));
    userEvent.click(
      await screen.findByPlaceholderText("Enter user names or email addresses"),
    );

    userEvent.click(
      await screen.findByText(`${user.first_name} ${user.last_name}`),
    );

    userEvent.click(await screen.findByText("Send email now"));

    const payload = await fetchMock
      .lastCall("path:/api/pulse/test")
      .request.json();
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards[0].id).toEqual(dashcard.id);
  });
});
