import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupDashboardEndpoints } from "__support__/server-mocks";
import { createMockDashboardState, createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { onUpdateDashCardVisualizationSettings as updateVisualizationSettings } from "metabase/dashboard/actions/core";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { Dashboard, DashboardTabId } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";

import { ClickBehaviorSidebar } from "./ClickBehaviorSidebar";

const FIRST_TAB = createMockDashboardTab({ id: 900, name: "first" });
const SECOND_TAB = createMockDashboardTab({ id: 901, name: "second" });
const REMOVED_TAB_ID = 999;

const TARGET_DASHBOARD = createMockDashboard({
  id: 2,
  name: "Target dashboard",
  tabs: [FIRST_TAB, SECOND_TAB],
});

const SINGLE_TAB_TARGET_DASHBOARD = createMockDashboard({
  ...TARGET_DASHBOARD,
  tabs: [FIRST_TAB],
});

interface SetupOpts {
  tabId: DashboardTabId;
  targetDashboard?: Dashboard;
}

function setup({ tabId, targetDashboard = TARGET_DASHBOARD }: SetupOpts) {
  const dashcard = createMockDashboardCard({
    card: createMockCard({ display: "line" }),
    visualization_settings: {
      click_behavior: {
        type: "link",
        linkType: "dashboard",
        targetId: targetDashboard.id,
        tabId,
        parameterMapping: {},
      },
    },
  });
  const dashboard = createMockDashboard({ id: 1, dashcards: [dashcard] });

  setupDashboardEndpoints(targetDashboard);

  const onUpdateDashCardVisualizationSettings = jest.fn(
    updateVisualizationSettings,
  );

  function TestSidebar() {
    const [visualizationSettings, setVisualizationSettings] = useState(
      dashcard.visualization_settings,
    );

    return (
      <MockDashboardContext
        dashboardId={dashboard.id}
        dashboard={dashboard}
        clickBehaviorSidebarDashcard={{
          ...dashcard,
          visualization_settings: visualizationSettings,
        }}
        onUpdateDashCardVisualizationSettings={Object.assign(
          (...args: Parameters<typeof updateVisualizationSettings>) => {
            const [, settings] = args;
            setVisualizationSettings((previous) => ({
              ...previous,
              ...settings,
            }));
            return onUpdateDashCardVisualizationSettings(...args);
          },
          updateVisualizationSettings,
        )}
      >
        <ClickBehaviorSidebar />
      </MockDashboardContext>
    );
  }

  renderWithProviders(<TestSidebar />, {
    storeInitialState: createMockState({
      dashboard: createMockDashboardState({
        dashboardId: dashboard.id,
        dashboards: {
          [dashboard.id]: { ...dashboard, dashcards: [dashcard.id] },
        },
        dashcards: { [dashcard.id]: dashcard },
        sidebar: {
          name: SIDEBAR_NAME.clickBehavior,
          props: { dashcardId: dashcard.id },
        },
      }),
    }),
  });

  return { onUpdateDashCardVisualizationSettings, dashcard };
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

    it("should allow saving after the user picks a new tab for a removed one", async () => {
      const { onUpdateDashCardVisualizationSettings, dashcard } = setup({
        tabId: REMOVED_TAB_ID,
      });

      expect(
        await screen.findByText("The selected tab is no longer available"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

      await userEvent.click(screen.getByLabelText("Select a dashboard tab"));
      await userEvent.click(
        await screen.findByRole("option", { name: SECOND_TAB.name }),
      );

      expect(
        screen.queryByText("The selected tab is no longer available"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
      expect(onUpdateDashCardVisualizationSettings).toHaveBeenCalledWith(
        dashcard.id,
        {
          click_behavior: expect.objectContaining({ tabId: SECOND_TAB.id }),
        },
      );
    });

    it("should allow saving when the selected tab has been removed and one tab is left", async () => {
      setup({
        tabId: REMOVED_TAB_ID,
        targetDashboard: SINGLE_TAB_TARGET_DASHBOARD,
      });

      expect(
        await screen.findByText(
          "Pass values to this dashboard's filters (optional)",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Select a dashboard tab"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    });

    it("should rewrite a removed tab to the only tab left in the dashcard settings", async () => {
      const { onUpdateDashCardVisualizationSettings, dashcard } = setup({
        tabId: REMOVED_TAB_ID,
        targetDashboard: SINGLE_TAB_TARGET_DASHBOARD,
      });

      await waitFor(() =>
        expect(onUpdateDashCardVisualizationSettings).toHaveBeenCalledWith(
          dashcard.id,
          {
            click_behavior: expect.objectContaining({
              type: "link",
              linkType: "dashboard",
              targetId: SINGLE_TAB_TARGET_DASHBOARD.id,
              tabId: FIRST_TAB.id,
            }),
          },
        ),
      );
    });
  });
});
