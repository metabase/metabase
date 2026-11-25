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
  parameterValues = {},
  draftParameterValues = {},
}: {
  parameterValues?: ParameterValuesMap;
  draftParameterValues?: ParameterValuesMap;
}) => {
  setupEnterprisePlugins();
  const onContext = jest.fn();
  const dashboard = createMockStoreDashboard({ id: 42 });

  renderWithProviders(
    <MetabotProvider>
      <ContextProbe onContext={onContext} />
    </MetabotProvider>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: 42,
          dashboards: { 42: dashboard },
          parameterValues,
          draftParameterValues,
        }),
      },
    },
  );
  return onContext;
};

describe("useRegisterDashboardMetabotContext", () => {
  it("sends the dashboard with no filter values when it has no filters", async () => {
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
