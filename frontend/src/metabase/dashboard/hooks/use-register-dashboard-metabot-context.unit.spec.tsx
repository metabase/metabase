import { useEffect } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  createMockDashboardState,
  createMockStoreDashboard,
} from "__support__/state";
import { renderWithProviders, waitFor } from "__support__/ui";
import { MetabotProvider, useMetabotContext } from "metabase/metabot";
import type {
  MetabotChatContext,
  ParameterValuesMap,
} from "metabase-types/api";
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
  selectedTabId = null,
  parameterValues = {},
  draftParameterValues = {},
}: {
  tabs?: ReturnType<typeof createMockDashboardTab>[];
  selectedTabId?: number | null;
  parameterValues?: ParameterValuesMap;
  draftParameterValues?: ParameterValuesMap;
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
          parameterValues,
          draftParameterValues,
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
          user_is_viewing: [
            { type: "dashboard", id: 42, tab_id: 102, parameters: [] },
          ],
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
          user_is_viewing: [{ type: "dashboard", id: 42, parameters: [] }],
        }),
      ),
    );
  });

  it("sends only the dashboard when it has no tabs", async () => {
    const onContext = setup({});

    await waitFor(() =>
      expect(onContext).toHaveBeenCalledWith(
        expect.objectContaining({
          user_is_viewing: [{ type: "dashboard", id: 42, parameters: [] }],
        }),
      ),
    );
  });

  it("sends the applied filter values, with a cleared filter as null", async () => {
    const onContext = setup({
      parameterValues: { category: ["Gizmo"], date: null },
    });

    await waitFor(() =>
      expect(onContext).toHaveBeenCalledWith(
        expect.objectContaining({
          user_is_viewing: [
            {
              type: "dashboard",
              id: 42,
              parameters: [
                { id: "category", value: ["Gizmo"] },
                { id: "date", value: null },
              ],
            },
          ],
        }),
      ),
    );
  });

  it("sends the applied values, not unapplied drafts", async () => {
    const onContext = setup({
      parameterValues: { category: ["Gizmo"] },
      draftParameterValues: { category: ["Widget"] },
    });

    await waitFor(() =>
      expect(onContext).toHaveBeenCalledWith(
        expect.objectContaining({
          user_is_viewing: [
            {
              type: "dashboard",
              id: 42,
              parameters: [{ id: "category", value: ["Gizmo"] }],
            },
          ],
        }),
      ),
    );
  });
});
