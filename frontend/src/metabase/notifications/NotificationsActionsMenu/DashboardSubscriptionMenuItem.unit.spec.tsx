import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { renderWithProviders, screen } from "__support__/ui";
import { Menu } from "metabase/ui";
import type { ChannelApiResponse } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DashboardSubscriptionMenuItem } from "./DashboardSubscriptionMenuItem";

const mockOnClick = jest.fn();

const createDashboardWithDataCards = () => {
  return createMockDashboard({
    dashcards: [
      createMockDashboardCard({
        card: createMockCard({ display: "table" }),
      }),
    ],
  });
};

const setup = ({
  isSuperuser = false,
  hasEmailSetup = false,
  hasSlackSetup = false,
  dashboard: mockDashboard = createDashboardWithDataCards(),
}: {
  isSuperuser?: boolean;
  hasEmailSetup?: boolean;
  hasSlackSetup?: boolean;
  dashboard?: ReturnType<typeof createMockDashboard>;
} = {}) => {
  const currentUser = createMockUser({
    is_superuser: isSuperuser,
  });
  const storeInitialState = createMockState({
    currentUser,
  });

  setupNotificationChannelsEndpoints({
    email: { configured: hasEmailSetup },
    slack: { configured: hasSlackSetup },
  } as ChannelApiResponse["channels"]);

  renderWithProviders(
    <Menu opened>
      <Menu.Dropdown>
        <DashboardSubscriptionMenuItem
          onClick={mockOnClick}
          dashboard={mockDashboard}
        />
      </Menu.Dropdown>
    </Menu>,
    { storeInitialState },
  );
};

describe("DashboardSubscriptionMenuItem", () => {
  it("should show 'Subscriptions' menu item when can manage subscriptions and has no email or slack setup", async () => {
    setup({
      isSuperuser: true,
      hasEmailSetup: false,
      hasSlackSetup: false,
    });

    expect(
      screen.getByTestId("dashboard-subscription-menu-item"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
  });

  describe("when user can't manage subscriptions and dashboard has data cards", () => {
    it.each([
      { hasEmailSetup: true, hasSlackSetup: false },
      { hasEmailSetup: false, hasSlackSetup: true },
      { hasEmailSetup: true, hasSlackSetup: true },
    ])(
      "should show 'Subscriptions' menu item when email is $hasEmailSetup and slack is $hasSlackSetup",
      async ({ hasEmailSetup, hasSlackSetup }) => {
        setup({
          isSuperuser: false,
          hasEmailSetup,
          hasSlackSetup,
        });

        expect(
          screen.getByTestId("dashboard-subscription-menu-item"),
        ).toBeInTheDocument();
        expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      },
    );

    it('should show "Can\'t send subscriptions" menu item when email and slack are not set up', async () => {
      setup({
        isSuperuser: false,
        hasEmailSetup: false,
        hasSlackSetup: false,
      });

      expect(
        screen.getByTestId("dashboard-subscription-menu-item"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("Can't send subscriptions"),
      ).toBeInTheDocument();
    });
  });
});
