import { createMockDashboardState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  ClickBehavior,
  Dashboard,
  DashboardCard,
} from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

import { ClickMappings } from "./ClickMappings";

const SOURCE_PARAMETER = createMockParameter({
  id: "source-parameter",
  name: "Category",
});

const TARGET_PARAMETER = createMockParameter({
  id: "target-parameter",
  name: "Target filter",
});

const SOURCE_DASHCARD = createMockDashboardCard({ id: 1, dashboard_id: 1 });

const SOURCE_DASHBOARD = createMockDashboard({
  id: 1,
  parameters: [SOURCE_PARAMETER],
});

const TARGET_DASHBOARD = createMockDashboard({
  id: 2,
  parameters: [TARGET_PARAMETER],
});

interface SetupOpts {
  dashboard: Dashboard;
  dashcard: DashboardCard;
  targetDashboard: Dashboard;
  clickBehavior: ClickBehavior;
}

function setup({
  dashboard,
  dashcard,
  targetDashboard,
  clickBehavior,
}: SetupOpts) {
  renderWithProviders(
    <ClickMappings
      object={targetDashboard}
      dashcard={dashcard}
      isDashboard
      clickBehavior={clickBehavior}
      updateSettings={jest.fn()}
    />,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: {
            [dashboard.id]: { ...dashboard, dashcards: [dashcard.id] },
          },
          dashcards: { [dashcard.id]: dashcard },
          editingDashboard: dashboard,
        }),
      },
    },
  );
}

function createClickBehavior(sourceParameterId: string): ClickBehavior {
  return {
    type: "link",
    linkType: "dashboard",
    targetId: TARGET_DASHBOARD.id,
    parameterMapping: {
      [TARGET_PARAMETER.id]: {
        id: TARGET_PARAMETER.id,
        source: { type: "parameter", id: sourceParameterId, name: "Text" },
        target: { type: "parameter", id: TARGET_PARAMETER.id },
      },
    },
  };
}

describe("ClickMappings", () => {
  it("should show the current name of a renamed source filter (metabase#84275)", () => {
    setup({
      dashboard: SOURCE_DASHBOARD,
      dashcard: SOURCE_DASHCARD,
      targetDashboard: TARGET_DASHBOARD,
      clickBehavior: createClickBehavior(SOURCE_PARAMETER.id),
    });

    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.queryByText("Text")).not.toBeInTheDocument();
  });

  it("should show the stored name when the source filter is not on the dashboard", () => {
    setup({
      dashboard: SOURCE_DASHBOARD,
      dashcard: SOURCE_DASHCARD,
      targetDashboard: TARGET_DASHBOARD,
      clickBehavior: createClickBehavior("removed-parameter"),
    });

    expect(screen.getByText("Text")).toBeInTheDocument();
  });
});
