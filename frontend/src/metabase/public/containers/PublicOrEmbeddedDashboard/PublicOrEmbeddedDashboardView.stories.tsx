// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
import { type ComponentProps, useEffect, useMemo } from "react";

import { getStore } from "__support__/entities-store";
import { createWaitForResizeToStopDecorator } from "__support__/storybook";
import { getNextId } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { publicReducers } from "metabase/reducers-public";
import { Box, Card, Popover, Text, Tooltip } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import ObjectDetail from "metabase/visualizations/visualizations/ObjectDetail";
import Table from "metabase/visualizations/visualizations/Table/Table";
import TABLE_RAW_SERIES from "metabase/visualizations/visualizations/Table/stories-data/orders-with-people.json";
import type { DashboardCard } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockParameter,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import {
  PublicOrEmbeddedDashboardView,
  type PublicOrEmbeddedDashboardViewProps,
} from "./PublicOrEmbeddedDashboardView";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Table);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(BarChart);

export default {
  title: "App/Embed/PublicOrEmbeddedDashboardView",
  component: PublicOrEmbeddedDashboardView,
  decorators: [
    ReduxDecorator,
    createWaitForResizeToStopDecorator(),
    MockIsEmbeddingDecorator,
  ],
  parameters: {
    layout: "fullscreen",
  },
};

function ReduxDecorator(Story: StoryFn) {
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
}

declare global {
  interface Window {
    overrideIsWithinIframe?: boolean;
  }
}
function MockIsEmbeddingDecorator(Story: StoryFn) {
  window.overrideIsWithinIframe = true;
  return <Story />;
}

const DASHBOARD_ID = getNextId();
const DASHCARD_BAR_ID = getNextId();
const DASHCARD_TABLE_ID = getNextId();
const CARD_BAR_ID = getNextId();
const CARD_TABLE_ID = getNextId();
const TAB_ID = getNextId();
const PARAMETER_ID = "param-hex";
const initialState = createMockState({
  currentUser: null,
  settings: createMockSettingsState({
    "hide-embed-branding?": false,
  }),
  dashboard: createMockDashboardState({
    dashcardData: {
      [DASHCARD_BAR_ID]: {
        [CARD_BAR_ID]: createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockColumn(StringColumn({ name: "Dimension" })),
              createMockColumn(NumberColumn({ name: "Count" })),
            ],
            rows: [
              ["foo", 1],
              ["bar", 2],
            ],
          }),
        }),
      },
      [DASHCARD_TABLE_ID]: {
        // Couldn't really figure out the type here.
        [CARD_TABLE_ID]: createMockDataset(TABLE_RAW_SERIES[0] as any),
      },
    },
  }),
});

const store = getStore(publicReducers, initialState, [Api.middleware]);

interface CreateDashboardOpts {
  hasScroll?: boolean;
  dashcards?: DashboardCard[];
}
function createDashboard({ hasScroll, dashcards }: CreateDashboardOpts = {}) {
  return createMockDashboard({
    id: DASHBOARD_ID,
    name: "My dashboard",
    width: "full",
    dashcards: dashcards ?? [
      createMockDashboardCard({
        id: DASHCARD_BAR_ID,
        dashboard_tab_id: TAB_ID,
        card: createMockCard({ id: CARD_BAR_ID, name: "Bar", display: "bar" }),
        size_x: 12,
        size_y: 8,
        parameter_mappings: [
          {
            card_id: CARD_BAR_ID,
            parameter_id: PARAMETER_ID,
            target: ["variable", ["template-tag", "abc"]],
          },
        ],
      }),
      createMockDashboardCard({
        id: DASHCARD_TABLE_ID,
        dashboard_tab_id: TAB_ID,
        card: createMockCard({
          id: CARD_TABLE_ID,
          name: "Table",
          display: "table",
        }),
        ...(!hasScroll ? { col: 12 } : { row: 8 }),
        size_x: 12,
        size_y: 8,
      }),
    ],
  });
}

const Template: StoryFn<PublicOrEmbeddedDashboardViewProps> = (args) => {
  return <PublicOrEmbeddedDashboardView {...args} />;
};

const defaultArgs: Partial<
  ComponentProps<typeof PublicOrEmbeddedDashboardView>
> = {
  dashboard: createDashboard(),
  downloadsEnabled: { pdf: true, results: true },
  titled: true,
  bordered: true,
  background: true,
  slowCards: {},
  selectedTabId: TAB_ID,
  parameters: [
    createMockParameter({
      id: PARAMETER_ID,
    }),
  ],
  withFooter: true,
};

export const LightThemeDefault = {
  render: Template,
  args: defaultArgs,
};

export const LightThemeScroll = {
  render: Template,

  args: {
    ...defaultArgs,
    dashboard: createDashboard({ hasScroll: true }),
  },

  decorators: [ScrollDecorator],
};

export const LightThemeNoBackgroundDefault = {
  render: Template,

  args: {
    ...defaultArgs,
    background: false,
  },
};

export const LightThemeNoBackgroundScroll = {
  render: Template,

  args: {
    ...defaultArgs,
    background: false,
    dashboard: createDashboard({ hasScroll: true }),
  },

  decorators: [ScrollDecorator],
};

export const DarkThemeDefault = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "night",
  },

  decorators: [DarkBackgroundDecorator],
};

export const DarkThemeScroll = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "night",
    dashboard: createDashboard({ hasScroll: true }),
  },

  decorators: [DarkBackgroundDecorator, ScrollDecorator],
};

export const DarkThemeNoBackgroundDefault = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "night",
    background: false,
  },

  decorators: [DarkBackgroundDecorator],
};

export const DarkThemeNoBackgroundScroll = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "night",
    background: false,
    dashboard: createDashboard({ hasScroll: true }),
  },

  decorators: [DarkBackgroundDecorator, ScrollDecorator],
};

export const TransparentThemeDefault = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "transparent",
  },

  decorators: [LightBackgroundDecorator],
};

export const TransparentThemeScroll = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "transparent",
    dashboard: createDashboard({ hasScroll: true }),
  },

  decorators: [LightBackgroundDecorator, ScrollDecorator],
};

export const TransparentThemeNoBackgroundDefault = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "transparent",
    background: false,
  },

  decorators: [LightBackgroundDecorator],
};

export const TransparentThemeNoBackgroundScroll = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "transparent",
    background: false,
    dashboard: createDashboard({ hasScroll: true }),
  },

  decorators: [LightBackgroundDecorator, ScrollDecorator],
};

// Other components compatibility test
export function ComponentCompatibility() {
  return (
    // Loki doesn't take into account the tooltips and dropdowns dimensions.
    // This padding is to make sure we cover the area of all of them.
    <Box pb="50px">
      <Tooltip
        label={
          <Text size="sm" c="var(--mb-color-text-primary)">
            Label
          </Text>
        }
        opened
      >
        <Card withBorder display="inline-block">
          Mantine Tooltip
        </Card>
      </Tooltip>
      <Popover withArrow shadow="md" opened>
        <Popover.Target>
          <Card withBorder display="inline-block">
            Mantine Popover
          </Card>
        </Popover.Target>
        <Popover.Dropdown>
          <Text size="sm" c="var(--mb-color-text-primary)">
            Dropdown
          </Text>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}

// Card visualizations

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(ObjectDetail);

export const CardVisualizationsLightTheme = {
  render: Template,

  args: {
    ...defaultArgs,
    dashboard: createDashboard({
      dashcards: [
        createMockDashboardCard({
          id: DASHCARD_TABLE_ID,
          dashboard_tab_id: TAB_ID,
          card: createMockCard({
            id: CARD_TABLE_ID,
            name: "Table detail",
            display: "object",
          }),
          size_x: 12,
          size_y: 8,
        }),
      ],
    }),
  },
};

export const CardVisualizationsDarkTheme = {
  render: Template,

  args: {
    ...CardVisualizationsLightTheme.args,
    theme: "night",
  },
};

function ScrollDecorator(Story: StoryFn) {
  const asyncCallback = useMemo(() => createAsyncCallback(), []);

  useEffect(() => {
    const scrollContainer = document.querySelector("[data-testid=embed-frame]");
    const intervalId = setInterval(() => {
      const contentHeight = scrollContainer?.scrollHeight ?? 0;
      if (contentHeight > 1000) {
        scrollContainer?.scrollBy(0, 9999);
        clearInterval(intervalId);
        asyncCallback();
      }
    }, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, [asyncCallback]);

  return <Story />;
}

function DarkBackgroundDecorator(Story: StoryFn) {
  return (
    <Box bg="#434e56" mih="100vh">
      <Story />
    </Box>
  );
}

function LightBackgroundDecorator(Story: StoryFn) {
  return (
    <Box bg="#ddd" mih="100vh">
      <Story />
    </Box>
  );
}
