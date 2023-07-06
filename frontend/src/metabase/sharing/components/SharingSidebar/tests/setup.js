import fetchMock from "fetch-mock";
import { renderWithProviders } from "__support__/ui";
import { mockSettings } from "__support__/settings";
import { createMockState } from "metabase-types/store/mocks";
import { setupEnterprisePlugins } from "__support__/enterprise";

import {
  createMockDashboard,
  createMockActionDashboardCard,
  createMockDashboardOrderedCard,
  createMockUser,
  createMockCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import SharingSidebar from "../SharingSidebar";

export const dashcard = createMockDashboardOrderedCard({ name: "dashcard" });

const actionDashcard = createMockActionDashboardCard({
  id: 2,
  name: "actionDashcard",
});
const linkDashcard = createMockActionDashboardCard({
  id: 3,
  name: "linkDashcard",
  card: createMockCard({ display: "link" }),
});

export const user = createMockUser();

const dashboard = createMockDashboard({
  ordered_cards: [dashcard, actionDashcard, linkDashcard],
  parameters: [
    {
      name: "ID",
      slug: "id",
      id: "abcd1234",
      type: "id",
      sectionId: "id",
    },
  ],
});

export function setup(
  { email, slack, tokenFeatures = {}, hasEnterprisePlugins = false } = {
    email: true,
    slack: true,
    tokenFeatures: {},
    hasEnterprisePlugins: false,
  },
) {
  const channelData = { channels: {} };

  if (email) {
    channelData.channels.email = {
      type: "email",
      name: "Email",
      allows_recipients: true,
      recipients: ["user", "email"],
      schedules: ["hourly"],
      configured: true,
    };
  }

  if (slack) {
    channelData.channels.slack = {
      type: "slack",
      name: "Slack",
      allows_recipients: false,
      schedules: ["hourly"],
      configured: true,
      fields: [
        {
          name: "channel",
          type: "select",
          displayName: "Post to",
          options: ["#general", "#random", "#alerts"],
          required: true,
        },
      ],
    };
  }

  fetchMock.get("path:/api/pulse/form_input", channelData);

  fetchMock.get("path:/api/user", {
    data: [user],
  });

  fetchMock.get(
    { url: `path:/api/pulse`, query: { dashboard_id: dashboard.id } },
    [],
  );

  fetchMock.post("path:/api/pulse/test", 200);

  const features = createMockTokenFeatures(tokenFeatures);
  const storeSettings = mockSettings({ "token-features": features });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <SharingSidebar dashboard={dashboard} onCancel={jest.fn()} />,
    {
      storeInitialState: createMockState({
        settings: storeSettings,
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
      }),
    },
  );
}

export const hasAdvancedFilterOptions = screen => {
  expect(
    screen.queryByText(
      /If a dashboard filter has a default value, it’ll be applied when your subscription is sent./i,
    ),
  ).not.toBeInTheDocument();

  expect(
    screen.getByText(/set filter values for when this gets sent/i),
  ).toBeVisible();

  return true;
};

export const hasBasicFilterOptions = screen => {
  expect(
    screen.getByText(
      /If a dashboard filter has a default value, it’ll be applied when your subscription is sent./i,
    ),
  ).toBeVisible();

  expect(
    screen.queryByText(/set filter values for when this gets sent/i),
  ).not.toBeInTheDocument();

  return true;
};
