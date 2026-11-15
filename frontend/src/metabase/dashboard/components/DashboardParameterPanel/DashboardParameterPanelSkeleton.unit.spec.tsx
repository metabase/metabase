import {
  createMockDashboardState,
  createMockStoreDashboard,
} from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

import { DashboardParameterPanelSkeleton } from "./DashboardParameterPanelSkeleton";

const PARAMETERS = [
  createMockParameter({ id: "a", slug: "a" }),
  createMockParameter({ id: "b", slug: "b" }),
  createMockParameter({ id: "c", slug: "c" }),
];

// Parameter "c" sits inline on this card rather than in the header.
const DASHCARD = createMockDashboardCard({ id: 10, inline_parameters: ["c"] });

function setup({
  isCached = true,
  hideParameters,
}: { isCached?: boolean; hideParameters?: string } = {}) {
  renderWithProviders(
    <DashboardParameterPanelSkeleton
      dashboardId={1}
      hideParameters={hideParameters}
    />,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboards: isCached
            ? {
                1: createMockStoreDashboard({
                  id: 1,
                  parameters: PARAMETERS,
                  dashcards: [DASHCARD.id],
                }),
              }
            : {},
          dashcards: { [DASHCARD.id]: DASHCARD },
        }),
      },
    },
  );
}

const getPlaceholders = () =>
  screen.getByTestId("dashboard-parameters-skeleton-filters").children;

describe("DashboardParameterPanelSkeleton", () => {
  it("draws one placeholder per header filter, leaving out inline ones", () => {
    setup();

    expect(getPlaceholders()).toHaveLength(2);
  });

  it("leaves out filters the embedding hides", () => {
    setup({ hideParameters: "b" });

    expect(getPlaceholders()).toHaveLength(1);
  });

  it("draws nothing on a fresh page load", () => {
    setup({ isCached: false });

    expect(
      screen.queryByTestId("dashboard-parameters-skeleton"),
    ).not.toBeInTheDocument();
  });
});
