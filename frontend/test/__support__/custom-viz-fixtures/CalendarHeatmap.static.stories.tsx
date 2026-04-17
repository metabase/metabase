// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
import { type ReactNode, useEffect, useMemo } from "react";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { getNextId } from "__support__/utils";
import { AppColorSchemeProvider } from "metabase/AppColorSchemeProvider";
import { Api } from "metabase/api";
import { Dashboard as DashboardComponent } from "metabase/dashboard/components/Dashboard/Dashboard";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import { publicReducers } from "metabase/reducers-public";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { MetabaseReduxProvider } from "metabase/utils/redux/custom-context";
import { EmbeddingSdkStaticMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkStaticMode";
import type { Dashboard as DashboardType } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  HEATMAP_COLS,
  HEATMAP_DISPLAY,
  HEATMAP_ROWS,
  useHeatmapPlugin,
} from "./calendar-heatmap-fixtures";

const DASHBOARD_ID = getNextId();
const DASHCARD_ID = getNextId();
const CARD_ID = getNextId();

const DATASET = createMockDataset({
  data: createMockDatasetData({ cols: HEATMAP_COLS, rows: HEATMAP_ROWS }),
});

function createHeatmapDashboard(): DashboardType {
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

function StaticDashboardProviders({ children }: { children: ReactNode }) {
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

  return (
    <AppColorSchemeProvider forceColorScheme="light">
      <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
    </AppColorSchemeProvider>
  );
}

/**
 * Non-SDK equivalent of what `SdkDashboard` does inside `StaticDashboard`:
 * render the real `<Dashboard />` component (not `PublicOrEmbeddedDashboardView`),
 * with `EmbeddingSdkStaticMode` click mode and the static dashboard action set.
 * Produces a read-only dashboard view without drill-throughs or query-builder
 * entry points — matching the "static embed" render path.
 */
const Template: StoryFn = () => {
  const asyncCallback = useMemo(() => createAsyncCallback(), []);
  const ready = useHeatmapPlugin();

  useEffect(() => {
    if (!ready) {
      return;
    }
    const id = setTimeout(asyncCallback, 1200);
    return () => clearTimeout(id);
  }, [ready, asyncCallback]);

  return (
    <StaticDashboardProviders>
      {ready ? (
        <MockDashboardContext
          dashboardId={DASHBOARD_ID}
          navigateToNewCardFromDashboard={null}
          titled
          bordered
          background
          theme="light"
          // Skips the collection fetch in DashboardHeader that otherwise
          // leaves the title area stuck on a spinner.
          isGuestEmbed
          downloadsEnabled={{ pdf: false, results: false }}
          getClickActionMode={() => EmbeddingSdkStaticMode}
          dashboardActions={[
            DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTIONS,
            DASHBOARD_ACTION.DOWNLOAD_PDF,
            DASHBOARD_ACTION.REFRESH_INDICATOR,
          ]}
        >
          <DashboardComponent className={EmbedFrameS.EmbedFrame} />
        </MockDashboardContext>
      ) : null}
    </StaticDashboardProviders>
  );
};

export default {
  title: "viz/CustomViz/CalendarHeatmap/Static",
  parameters: {
    layout: "fullscreen",
  },
};

export const Dashboard = {
  render: Template,
};
