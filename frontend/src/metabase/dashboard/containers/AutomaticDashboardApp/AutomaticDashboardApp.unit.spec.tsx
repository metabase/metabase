import userEvent from "@testing-library/user-event";

import {
  setupAutoDashboardEndpoints,
  setupDatabaseListEndpoint,
} from "__support__/server-mocks";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { setStoredSidePanelWidth } from "metabase/common/components/ResizableSidePanel";
import { Route } from "metabase/router";
import type { RelatedDashboardXRays } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { AutomaticDashboardApp } from "./AutomaticDashboardApp";

const TEST_DATABASE_WITH_ACTIONS = createMockDatabase({
  settings: { "database-enable-actions": true },
});

type SetupOpts = {
  related?: RelatedDashboardXRays;
};

const RELATED_XRAYS: RelatedDashboardXRays = {
  "zoom-in": [
    {
      title: "Orders by product",
      description: "A closer look at orders",
      url: "/auto/dashboard/table/2",
    },
  ],
};

const setup = async ({ related }: SetupOpts = {}) => {
  const mockDashboard = createMockDashboard({ related });
  const dashboardId = mockDashboard.id;

  setupAutoDashboardEndpoints(
    mockDashboard,
    createMockDashboardQueryMetadata({
      databases: [TEST_DATABASE_WITH_ACTIONS],
    }),
  );
  setupDatabaseListEndpoint([TEST_DATABASE_WITH_ACTIONS]);

  renderWithProviders(
    <Route path="/auto/dashboard/*" element={<AutomaticDashboardApp />} />,
    {
      withRouter: true,
      initialRoute: `/auto/dashboard/table/${dashboardId}`,
      storeInitialState: {
        dashboard: createMockDashboardState({ dashboardId }),
        entities: createMockEntitiesState({
          databases: [TEST_DATABASE_WITH_ACTIONS],
        }),
      },
    },
  );

  await waitForLoaderToBeRemoved();

  return {
    dashboardId,
  };
};

describe("AutomaticDashboardApp", () => {
  describe("suggestions sidebar", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("shows related x-rays in a resizable panel at the medium width", async () => {
      await setup({ related: RELATED_XRAYS });

      const panel = screen.getByTestId("resizable-side-panel");
      expect(panel).toHaveStyle({ width: "320px" });
      expect(within(panel).getByText("Orders by product")).toBeInTheDocument();
    });

    it("opens at the width the user last resized it to", async () => {
      setStoredSidePanelWidth("xray-suggestions", 300);

      await setup({ related: RELATED_XRAYS });

      expect(screen.getByTestId("resizable-side-panel")).toHaveStyle({
        width: "300px",
      });
    });

    it("is not shown without related x-rays", async () => {
      await setup();

      expect(
        screen.queryByTestId("resizable-side-panel"),
      ).not.toBeInTheDocument();
    });
  });

  it("Shows 'See it' link next to Save button when dashboard is saved", async () => {
    const { dashboardId } = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Save this" }));
    const savedButton = await screen.findByRole("button", { name: "Saved" });
    expect(savedButton).toBeDisabled();
    const seeItLink = within(
      screen.getByTestId("automatic-dashboard-header"),
    ).getByRole("link", { name: "See it" });
    expect(seeItLink).toHaveAttribute(
      "href",
      `/dashboard/${dashboardId}-dashboard`,
    );
  });
});
