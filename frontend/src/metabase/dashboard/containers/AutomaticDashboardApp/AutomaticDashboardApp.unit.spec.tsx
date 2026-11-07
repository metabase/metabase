import userEvent from "@testing-library/user-event";

import {
  setupAutoDashboardEndpoints,
  setupDatabaseListEndpoint,
} from "__support__/server-mocks";
import {
  createMockDashboardState,
  createMockEmbedOptions,
  createMockEmbedState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import type { InteractiveEmbeddingOptions } from "metabase/redux/store";
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
  embedOptions?: Partial<InteractiveEmbeddingOptions>;
  isWithinIframe?: boolean;
  related?: RelatedDashboardXRays;
};

const RELATED_WITH_ZOOM_OUT: RelatedDashboardXRays = {
  "zoom-out": [
    { title: "Zoom out", description: "Zoom out", url: "/auto/zoom-out" },
  ],
};

const setup = async ({
  embedOptions,
  isWithinIframe = false,
  related,
}: SetupOpts = {}) => {
  if (isWithinIframe) {
    window.overrideIsWithinIframe = true;
  }
  const mockDashboard = createMockDashboard(related ? { related } : {});
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
        embed: createMockEmbedState({
          options: createMockEmbedOptions(embedOptions),
        }),
        entities: createMockEntitiesState({
          databases: [TEST_DATABASE_WITH_ACTIONS],
        }),
      },
    },
  );

  await waitForDashboardToLoad();

  return {
    dashboardId,
  };
};

describe("AutomaticDashboardApp", () => {
  afterEach(() => {
    delete window.overrideIsWithinIframe;
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

  it("should show the dashboard header by default and hide it by a param (shown by default)", async () => {
    await setup({ isWithinIframe: true, related: RELATED_WITH_ZOOM_OUT });

    expect(
      await screen.findByRole("heading", { name: "More X-rays" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save this" })).toBeVisible();
  });

  it("should show the dashboard header by default and hide it by a param (hidden by the header=false param)", async () => {
    await setup({
      isWithinIframe: true,
      embedOptions: { header: false },
      related: RELATED_WITH_ZOOM_OUT,
    });

    expect(
      await screen.findByRole("heading", { name: "More X-rays" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save this" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("automatic-dashboard-header"),
    ).not.toBeInTheDocument();
  });
});
