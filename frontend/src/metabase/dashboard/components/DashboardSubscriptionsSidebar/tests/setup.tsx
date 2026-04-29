/* istanbul ignore file */
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  createDashboardReduxState,
  setupNotificationChannelsScenario,
} from "__support__/scenarios";
import { setupUserRecipientsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import type { Screen } from "__support__/ui";
import { renderWithProviders } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { isEmbeddingSdk as mockIsEmbeddingSdk } from "metabase/embedding-sdk/config";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import { createMockState } from "metabase/redux/store/mocks";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  DashboardCard,
  DashboardSubscription,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import DashboardSubscriptionsSidebar from "../DashboardSubscriptionsSidebar";

jest.mock("metabase/embedding-sdk/config", () => ({
  isEmbeddingSdk: jest.fn(() => false),
}));

export const dashcard = createMockDashboardCard();

const actionDashcard = createMockActionDashboardCard({
  id: 2,
});
const linkDashcard = createMockActionDashboardCard({
  id: 3,
  card: createMockCard({ display: "link" }),
});

export const user = createMockUser();

const defaultDashcards = [dashcard, actionDashcard, linkDashcard];
const defaultParameters = [
  {
    name: "ID",
    slug: "id",
    id: "abcd1234",
    type: "id",
    sectionId: "id",
  },
];

type SetupOpts = {
  email?: boolean;
  slack?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  isAdmin?: boolean;
  dashcards?: DashboardCard[];
  parameters?: UiParameter[];
  isEmbeddingSdk?: boolean;
  setSharing?: (sharing: boolean) => void;
  pulses?: (Partial<DashboardSubscription> & { id: number })[];
  currentUser?: {
    firstName: string;
    lastName: string;
  };
  pulseListDelay?: number;
};

export function setup({
  email = true,
  slack = true,
  tokenFeatures = {},
  enterprisePlugins,
  isAdmin = false,
  dashcards = defaultDashcards,
  parameters = defaultParameters,
  isEmbeddingSdk = false,
  setSharing,
  pulses = [],
  currentUser,
  pulseListDelay = 0,
}: SetupOpts = {}) {
  const dashboard = createMockDashboard({
    dashcards,
    parameters,
  });

  (mockIsEmbeddingSdk as jest.Mock).mockReturnValue(isEmbeddingSdk);

  setupNotificationChannelsScenario({ email, slack });

  setupUserRecipientsEndpoint({
    users: [user],
  });

  fetchMock.get({
    url: `path:/api/pulse`,
    query: { dashboard_id: dashboard.id },
    response: () => pulses,
    // Delay is crucial to reproduce (EMB-1060), otherwise, the state updates too fast which isn't realistic
    delay: pulseListDelay,
  });

  // Mock POST that updates the GET response
  fetchMock.post("path:/api/pulse", ({ options }) => {
    const body = JSON.parse(options.body as string);
    const newPulse = { ...body, id: getNextId() } as DashboardSubscription;
    pulses.push(newPulse);
    return newPulse;
  });

  fetchMock.post("path:/api/pulse/test", 200);

  const storeSettings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(
    <MockDashboardContext dashboard={dashboard} setSharing={setSharing}>
      <DashboardSubscriptionsSidebar />
    </MockDashboardContext>,
    {
      storeInitialState: createMockState({
        settings: storeSettings,
        currentUser: createMockUser({
          first_name: currentUser?.firstName,
          last_name: currentUser?.lastName,
          is_superuser: isAdmin,
        }),
        dashboard: createDashboardReduxState({ ...dashboard, dashcards }),
      }),
    },
  );
}

export const hasAdvancedFilterOptionsHidden = (screen: Screen) => {
  expect(
    screen.queryByText(
      /If a dashboard filter has a default value, it’ll be applied when your subscription is sent./i,
    ),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByText(/set filter values for when this gets sent/i),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByTestId("subscription-parameters-section"),
  ).not.toBeInTheDocument();

  return true;
};

export const hasBasicFilterOptions = (screen: Screen) => {
  expect(
    screen.getByText(
      /If a dashboard filter has a default value, it'll be applied when your subscription is sent./i,
    ),
  ).toBeVisible();

  expect(
    screen.queryByText(/set filter values for when this gets sent/i),
  ).not.toBeInTheDocument();

  return true;
};
