// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
import { HttpResponse, http } from "msw";
import { type ReactNode, useEffect, useMemo } from "react";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { getNextId } from "__support__/utils";
import { AppColorSchemeProvider } from "metabase/AppColorSchemeProvider";
import { Api } from "metabase/api";
// Side-effect import: provides the `#popover-event-target { position: fixed }`
// rule that ChartTooltip relies on to anchor near the hovered cell.
import "metabase/common/components/Popover/Popover.module.css";
import { PublicOrEmbeddedDashboardView } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboardView";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import type { DisplayTheme } from "metabase/public/lib/types";
import { publicReducers } from "metabase/reducers-public";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { MetabaseReduxProvider } from "metabase/utils/redux/custom-context";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  HEATMAP_COLS,
  HEATMAP_DISPLAY,
  HEATMAP_ROWS,
  HEATMAP_SNAPSHOT_DELAY_MS,
  useHeatmapPlugin,
} from "./calendar-heatmap-fixtures";

const DASHBOARD_ID = getNextId();
const DASHCARD_ID = getNextId();
const CARD_ID = getNextId();

const DATASET = createMockDataset({
  data: createMockDatasetData({ cols: HEATMAP_COLS, rows: HEATMAP_ROWS }),
});

function createHeatmapDashboard(): Dashboard {
  return createMockDashboard({
    id: DASHBOARD_ID,
    name: "Activity heatmap",
    width: "full",
    dashcards: [
      createMockDashboardCard({
        id: DASHCARD_ID,
        card: createMockCard({
          id: CARD_ID,
          name: "Calendar heatmap",
          display: HEATMAP_DISPLAY,
        }),
        size_x: 24,
        size_y: 6,
        row: 0,
      }),
    ],
  });
}

function DashboardProviders({
  theme,
  children,
}: {
  theme: DisplayTheme;
  children: ReactNode;
}) {
  const store = useMemo(() => {
    const dashboard = createHeatmapDashboard();
    const initialState = createMockState({
      settings: createMockSettingsState({ "hide-embed-branding?": false }),
      dashboard: createMockDashboardState({
        dashboardId: dashboard.id,
        dashboards: {
          [dashboard.id]: {
            ...dashboard,
            dashcards: dashboard.dashcards.map((dc) => dc.id),
          },
        },
        dashcards: _.indexBy(dashboard.dashcards, "id"),
        dashcardData: {
          [DASHCARD_ID]: { [CARD_ID]: DATASET },
        },
      }),
    });
    return getStore(publicReducers, initialState, [Api.middleware]);
  }, []);

  const forceColorScheme = theme === "night" ? "dark" : "light";

  return (
    <AppColorSchemeProvider forceColorScheme={forceColorScheme}>
      <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
    </AppColorSchemeProvider>
  );
}

const Template: StoryFn<{ theme: DisplayTheme }> = ({ theme }) => {
  const asyncCallback = useMemo(() => createAsyncCallback(), []);
  const ready = useHeatmapPlugin();

  useEffect(() => {
    if (!ready) {
      return;
    }
    const id = setTimeout(asyncCallback, HEATMAP_SNAPSHOT_DELAY_MS);
    return () => clearTimeout(id);
  }, [ready, asyncCallback]);

  return (
    <DashboardProviders theme={theme}>
      {ready ? (
        <MockDashboardContext
          dashboardId={DASHBOARD_ID}
          navigateToNewCardFromDashboard={null}
          titled
          bordered
          background
          theme={theme}
          downloadsEnabled={{ pdf: false, results: false }}
        >
          <PublicOrEmbeddedDashboardView />
        </MockDashboardContext>
      ) : null}
    </DashboardProviders>
  );
};

export default {
  title: "viz/CustomViz/CalendarHeatmap/Dashboard",
  render: Template,
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.get("*/api/database", () =>
          HttpResponse.json(createMockDatabase()),
        ),
        http.get("*/api/ee/custom-viz-plugin/list", () =>
          HttpResponse.json([]),
        ),
      ],
    },
  },
};

export const Light = {
  render: Template,
  args: { theme: "light" as DisplayTheme },
};

export const Dark = {
  render: Template,
  args: { theme: "night" as DisplayTheme },
};
