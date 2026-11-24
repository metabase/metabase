import userEvent from "@testing-library/user-event";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import * as embeddingConfig from "metabase/embedding/config";
import type { TimelineEvent } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

import { setup } from "./setup";
import {
  RC1,
  RC2,
  createTimeSeriesDashcard,
  expectReadOnlyDashboardEvents,
  findEventChip,
  getTimelineRequests,
  setupTimeSeriesChart,
} from "./timeline-events";

// `timeline-events` registers the interactive visualizations the charts need
jest.mock("metabase/static-viz/register", () => ({
  registerStaticVisualizations: jest.fn(),
}));

const DASHBOARD_TITLE = "Actions Dashboard";

// The public route registers request interceptors for the whole module, so it
// gets its own spec file instead of sharing one with the static embed route.
describe("PublicOrEmbeddedDashboardPage (public link)", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should hide action buttons on a public dashboard (metabase#34395)", async () => {
    await setup({
      dashboardTitle: DASHBOARD_TITLE,
      accessType: "public",
      hasEmbedBranding: true,
      extraDashcards: [
        createMockActionDashboardCard({
          id: 100,
          action: createMockImplicitQueryAction({ name: "Create" }),
          visualization_settings: {
            ...createMockActionDashboardCard().visualization_settings,
            "button.label": "Create row",
          },
        }),
      ],
    });

    expect(
      screen.getByRole("heading", { name: DASHBOARD_TITLE }),
    ).toBeInTheDocument();
    const grid = screen.getByTestId("dashboard-grid");
    expect(within(grid).getAllByTestId("dashcard")).toHaveLength(1);
    expect(within(grid).queryByText("Create row")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Powered by Metabase" }),
    ).toBeInTheDocument();
  });

  describe("timeline events", () => {
    const setupTimelineEvents = async (timelineEvents: TimelineEvent[]) => {
      jest.spyOn(embeddingConfig, "isPublicEmbedding").mockReturnValue(true);
      setupTimeSeriesChart();
      await setup({
        dashboardTitle: DASHBOARD_TITLE,
        accessType: "public",
        extraDashcards: [createTimeSeriesDashcard(timelineEvents)],
      });
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("shows only the saved events, read-only", async () => {
      await setupTimelineEvents([RC1]);

      await expectReadOnlyDashboardEvents();
    });

    it("opens the read-only details of a single chip with the keyboard", async () => {
      await setupTimelineEvents([RC1]);
      const chip = await findEventChip(RC1.name);

      chip.focus();
      expect(chip).toHaveFocus();
      await userEvent.keyboard("{Enter}");

      const popover = await screen.findByTestId("timeline-event-popover");
      // the keyboard-opened details take the focus, so Escape has to return it
      await waitFor(() => expect(chip).not.toHaveFocus());
      expect(within(popover).getByText(RC1.name)).toBeInTheDocument();
      expect(
        within(popover).getByText("The first release candidate is ready."),
      ).toBeInTheDocument();
      expect(within(popover).queryByText("See all")).not.toBeInTheDocument();
      expect(within(popover).queryByRole("checkbox")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("dashboard-events-sidebar"),
      ).not.toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByTestId("timeline-event-popover"),
        ).not.toBeInTheDocument(),
      );
      await waitFor(() => expect(chip).toHaveFocus());

      await userEvent.hover(chip);
      expect(
        within(await screen.findByTestId("timeline-event-popover")).getByText(
          RC1.name,
        ),
      ).toBeInTheDocument();
      expect(getTimelineRequests()).toEqual([]);
    });

    it("lists every event of a grouped chip with the keyboard", async () => {
      await setupTimelineEvents([RC1, RC2]);
      const chip = await findEventChip("2 events");

      chip.focus();
      expect(chip).toHaveFocus();
      await userEvent.keyboard("{Enter}");

      const popover = await screen.findByTestId("timeline-event-popover");
      // the keyboard-opened details take the focus, so Escape has to return it
      await waitFor(() => expect(chip).not.toHaveFocus());
      expect(within(popover).getByText(RC1.name)).toBeInTheDocument();
      expect(within(popover).getByText(RC2.name)).toBeInTheDocument();
      expect(within(popover).queryByText("See all")).not.toBeInTheDocument();
      expect(within(popover).queryByRole("checkbox")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("dashboard-events-sidebar"),
      ).not.toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByTestId("timeline-event-popover"),
        ).not.toBeInTheDocument(),
      );
      await waitFor(() => expect(chip).toHaveFocus());
      expect(getTimelineRequests()).toEqual([]);
    });
  });
});
