// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryContext, StoryFn } from "@storybook/react";
import { userEvent, within } from "@storybook/test";
import { HttpResponse, http } from "msw";

import { getStore } from "__support__/entities-store";
import { createWaitForResizeToStopDecorator } from "__support__/storybook";
import { getNextId } from "__support__/utils";
import { Api } from "metabase/api";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { PublicOrEmbeddedDashboardView } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboardView";
import {
  MockDashboardContext,
  type MockDashboardContextProps,
} from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import { publicReducers } from "metabase/reducers-public";
import { registerVisualization } from "metabase/visualizations";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { Map } from "./index";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Map);

// Initialize MetabaseSettings with required values for map rendering
MetabaseSettings.set(
  "map-tile-server-url",
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
);

export default {
  title: "viz/GridMapPdfExport",
  component: PublicOrEmbeddedDashboardView,
  decorators: [ReduxDecorator, createWaitForResizeToStopDecorator(2000)],
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.get("*/api/database", () =>
          HttpResponse.json(createMockDatabase()),
        ),
      ],
    },
  },
};

const DASHBOARD_ID = getNextId();
const DASHCARD_MAP_ID = getNextId();
const CARD_MAP_ID = getNextId();

function ReduxDecorator(Story: StoryFn, context: StoryContext) {
  const dashboard = (context.args.dashboard as Dashboard) ?? createDashboard();
  const initialState = createMockState({
    currentUser: null,
    settings: createMockSettingsState({
      "hide-embed-branding?": false,
    }),
    dashboard: createMockDashboardState({
      dashboardId: dashboard.id,
      dashboards: {
        [dashboard.id]: {
          ...dashboard,
          dashcards: dashboard.dashcards.map((dashcard) => dashcard.id),
        },
      },
      dashcards: Object.fromEntries(
        dashboard.dashcards.map((dc) => [dc.id, dc]),
      ),
      dashcardData: {
        [DASHCARD_MAP_ID]: {
          [CARD_MAP_ID]: createMockDataset({
            data: createMockDatasetData({
              cols: [
                createMockColumn({
                  name: "Latitude",
                  display_name: "Latitude",
                  base_type: "type/Float",
                  semantic_type: "type/Latitude",
                  source: "native",
                }),
                createMockColumn({
                  name: "Longitude",
                  display_name: "Longitude",
                  base_type: "type/Float",
                  semantic_type: "type/Longitude",
                  source: "native",
                }),
                createMockColumn({
                  name: "metric",
                  display_name: "metric",
                  base_type: "type/Integer",
                  semantic_type: "type/Quantity",
                  source: "native",
                }),
              ],
              rows: [
                [20, -110, 1],
                [70, -170, 5],
              ],
            }),
          }),
        },
      },
    }),
  });
  const store = getStore(publicReducers, initialState, [Api.middleware]);
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
}

function createDashboard() {
  return createMockDashboard({
    id: DASHBOARD_ID,
    name: "Grid Map Dashboard",
    width: "full",
    dashcards: [
      createMockDashboardCard({
        id: DASHCARD_MAP_ID,
        card: createMockCard({
          id: CARD_MAP_ID,
          name: "Grid Map",
          display: "map",
        }),
        size_x: 12,
        size_y: 8,
        visualization_settings: {
          "map.type": "grid",
          "map.latitude_column": "Latitude",
          "map.longitude_column": "Longitude",
          "map.metric_column": "metric",
        },
      }),
    ],
  });
}

const Template: StoryFn<MockDashboardContextProps> = (
  args: MockDashboardContextProps,
) => (
  <MockDashboardContext
    {...args}
    dashboardId={args.dashboardId ?? args.dashboard?.id}
    dashboardActions={DASHBOARD_DISPLAY_ACTIONS}
  >
    <PublicOrEmbeddedDashboardView />
  </MockDashboardContext>
);

const defaultArgs: Partial<MockDashboardContextProps> = {
  dashboard: createDashboard(),
  downloadsEnabled: { pdf: true, results: true },
  titled: true,
  bordered: true,
  background: true,
  slowCards: {},
  selectedTabId: null,
  withFooter: true,
};

const triggerPdfExport = async (
  canvasElement: HTMLElement,
  asyncCallback: () => void,
) => {
  const canvas = within(canvasElement);

  // Wait for the embed frame to render
  await canvas.findByTestId("embed-frame", {}, { timeout: 10000 });

  // Find and click the "Download as PDF" button
  const documentElement = within(document.documentElement);
  const pdfButton = await documentElement.findByTestId(
    "export-as-pdf-button",
    {},
    { timeout: 5000 },
  );
  await userEvent.click(pdfButton);

  // Wait for the image to be rendered (this is set by openImageBlobOnStorybook)
  await canvas.findByTestId("image-downloaded", {}, { timeout: 30000 });
  asyncCallback();
};

export const GridMapPdfExport = {
  render: Template,
  args: defaultArgs,

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const asyncCallback = createAsyncCallback();
    await triggerPdfExport(canvasElement, asyncCallback);
  },
};
