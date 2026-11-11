import { setupDashboardEndpoints } from "__support__/server-mocks";
import { createMockDashboardState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { DashboardTabId } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";

import { ClickBehaviorSidebarInner } from "./ClickBehaviorSidebar";

const FIRST_TAB = createMockDashboardTab({ id: 900, name: "first" });
const SECOND_TAB = createMockDashboardTab({ id: 901, name: "second" });
const REMOVED_TAB_ID = 999;

const TARGET_DASHBOARD = createMockDashboard({
  id: 2,
  name: "Target dashboard",
  tabs: [FIRST_TAB, SECOND_TAB],
});

interface SetupOpts {
  tabId: DashboardTabId;
}

function setup({ tabId }: SetupOpts) {
  const dashcard = createMockDashboardCard({
    card: createMockCard({ display: "line" }),
    visualization_settings: {
      click_behavior: {
        type: "link",
        linkType: "dashboard",
        targetId: TARGET_DASHBOARD.id,
        tabId,
        parameterMapping: {},
      },
    },
  });
  const dashboard = createMockDashboard({ id: 1, dashcards: [dashcard] });

  setupDashboardEndpoints(TARGET_DASHBOARD);

  renderWithProviders(
    <MockDashboardContext dashboardId={dashboard.id} dashboard={dashboard}>
      <ClickBehaviorSidebarInner
        dashboard={dashboard}
        clickBehaviorSidebarDashcard={dashcard}
      />
    </MockDashboardContext>,
    {
      storeInitialState: createMockState({
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: {
            [dashboard.id]: { ...dashboard, dashcards: [dashcard.id] },
          },
          dashcards: { [dashcard.id]: dashcard },
        }),
      }),
    },
  );
}

describe("ClickBehaviorSidebar", () => {
  describe("link to a dashboard tab", () => {
    it("should allow saving when the selected tab exists", async () => {
      setup({ tabId: SECOND_TAB.id });

      expect(
        await screen.findByLabelText("Select a dashboard tab"),
      ).toHaveValue(SECOND_TAB.name);
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    });

    it("should not allow saving when the selected tab has been removed", async () => {
      setup({ tabId: REMOVED_TAB_ID });

      expect(
        await screen.findByText("The selected tab is no longer available"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    });
  });
});
