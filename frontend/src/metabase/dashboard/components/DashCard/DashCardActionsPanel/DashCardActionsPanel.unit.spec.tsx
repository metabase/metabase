import { createMockDashboardState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { DashboardCard } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockHeadingDashboardCard,
  createMockLinkDashboardCard,
  createMockSingleSeries,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

import { DashCardActionsPanel } from "./DashCardActionsPanel";

registerVisualizations();

interface SetupOpts {
  dashcard: DashboardCard;
}

function setup({ dashcard }: SetupOpts) {
  const dashboard = createMockDashboard({ dashcards: [dashcard] });

  renderWithProviders(
    <DashCardActionsPanel
      series={[
        {
          ...createMockSingleSeries({ display: dashcard.card.display }),
          isSlow: false,
          isUsuallyFast: false,
        },
      ]}
      dashcard={dashcard}
      question={null}
      isLoading={false}
      isPreviewing={false}
      hasError={false}
      isTrashedOnRemove={false}
      onDuplicate={jest.fn()}
      onRemove={jest.fn()}
      onReplaceCard={jest.fn()}
      onReplaceAllDashCardVisualizationSettings={jest.fn()}
      onUpdateVisualizationSettings={jest.fn()}
      showClickBehaviorSidebar={jest.fn()}
      onPreviewToggle={jest.fn()}
      onLeftEdge={false}
      onMouseDown={jest.fn()}
      onAddParameter={jest.fn()}
    />,
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

describe("DashCardActionsPanel", () => {
  describe("click behavior action", () => {
    it("should be available for question cards", () => {
      setup({
        dashcard: createMockDashboardCard({
          card: createMockCard({ display: "line" }),
        }),
      });

      expect(screen.getByLabelText("Duplicate")).toBeInTheDocument();
      expect(screen.getByLabelText("Click behavior")).toBeInTheDocument();
    });

    it.each([
      ["text", createMockTextDashboardCard()],
      ["heading", createMockHeadingDashboardCard()],
      ["action", createMockActionDashboardCard()],
      ["link", createMockLinkDashboardCard()],
      [
        "object detail",
        createMockDashboardCard({
          card: createMockCard({ display: "object" }),
        }),
      ],
    ])("should not be available for %s cards", (_, dashcard) => {
      setup({ dashcard });

      expect(screen.getByLabelText("Duplicate")).toBeInTheDocument();
      expect(screen.queryByLabelText("Click behavior")).not.toBeInTheDocument();
    });
  });
});
