import { useEffect } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  createMockDashboardState,
  createMockStoreDashboard,
} from "__support__/state";
import { renderWithProviders, waitFor } from "__support__/ui";
import { MetabotProvider, useMetabotContext } from "metabase/metabot";
import type { MetabotChatContext } from "metabase-types/api";
import { createMockDashboardTab } from "metabase-types/api/mocks";

import { useRegisterDashboardMetabotContext } from "./use-register-dashboard-metabot-context";

const ContextProbe = ({
  onContext,
}: {
  onContext: (context: MetabotChatContext) => void;
}) => {
  useRegisterDashboardMetabotContext();
  const { getChatContext } = useMetabotContext();
  useEffect(() => {
    void getChatContext().then(onContext);
  }, [getChatContext, onContext]);
  return null;
};

const setup = ({
  tabs,
  selectedTabId,
}: {
  tabs?: ReturnType<typeof createMockDashboardTab>[];
  selectedTabId: number | null;
}) => {
  setupEnterprisePlugins();
  const onContext = jest.fn();
  const dashboard = createMockStoreDashboard({ id: 42, tabs });

  renderWithProviders(
    <MetabotProvider>
      <ContextProbe onContext={onContext} />
    </MetabotProvider>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: 42,
          dashboards: { 42: dashboard },
          selectedTabId,
        }),
      },
    },
  );
  return onContext;
};

describe("useRegisterDashboardMetabotContext", () => {
  it("sends the open tab of a dashboard with tabs", async () => {
    const onContext = setup({
      tabs: [
        createMockDashboardTab({ id: 101, dashboard_id: 42, name: "Revenue" }),
        createMockDashboardTab({ id: 102, dashboard_id: 42, name: "Pipeline" }),
      ],
      selectedTabId: 102,
    });

    await waitFor(() =>
      expect(onContext).toHaveBeenCalledWith(
        expect.objectContaining({
          user_is_viewing: [{ type: "dashboard", id: 42, tab_id: 102 }],
        }),
      ),
    );
  });

  it("leaves out a tab that hasn't been saved yet", async () => {
    const onContext = setup({
      tabs: [
        createMockDashboardTab({ id: 101, dashboard_id: 42, name: "Revenue" }),
        createMockDashboardTab({ id: -2, dashboard_id: 42, name: "New tab" }),
      ],
      selectedTabId: -2,
    });

    await waitFor(() =>
      expect(onContext).toHaveBeenCalledWith(
        expect.objectContaining({
          user_is_viewing: [{ type: "dashboard", id: 42 }],
        }),
      ),
    );
  });

  it("sends only the dashboard when it has no tabs", async () => {
    const onContext = setup({ selectedTabId: null });

    await waitFor(() =>
      expect(onContext).toHaveBeenCalledWith(
        expect.objectContaining({
          user_is_viewing: [{ type: "dashboard", id: 42 }],
        }),
      ),
    );
  });
});
