// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { ComponentStory, Story } from "@storybook/react";
import { useEffect, type ComponentProps } from "react";
import { Provider } from "react-redux";

import { getStore } from "__support__/entities-store";
import { getNextId } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { waitTimeContext } from "metabase/context/wait-time";
import { publicReducers } from "metabase/reducers-public";
import { Box } from "metabase/ui";
import TABLE_RAW_SERIES from "metabase/visualizations/components/TableSimple/stories-data/table-simple-orders-with-people.json";
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

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

export default {
  title: "embed/PublicOrEmbeddedDashboardView",
  component: PublicOrEmbeddedDashboardView,
  decorators: [
    ReduxDecorator,
    FasterExplicitSizeUpdateDecorator,
    WaitForResizeToStopDecorator,
    MockIsEmbeddingDecorator,
  ],
  parameters: {
    layout: "fullscreen",
  },
};

function ReduxDecorator(Story: Story) {
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
}

function FasterExplicitSizeUpdateDecorator(Story: Story) {
  return (
    <waitTimeContext.Provider value={0}>
      <Story />
    </waitTimeContext.Provider>
  );
}

/**
 * This is an arbitrary number, it should be big enough to pass CI tests.
 * This value works together with FasterExplicitSizeUpdateDecorator which
 * make sure we finish resizing any ExplicitSize components the fastest.
 */
const TIME_UNTIL_ALL_ELEMENTS_STOP_RESIZING = 1000;
function WaitForResizeToStopDecorator(Story: Story) {
  const asyncCallback = createAsyncCallback();
  useEffect(() => {
    setTimeout(asyncCallback, TIME_UNTIL_ALL_ELEMENTS_STOP_RESIZING);
  }, [asyncCallback]);

  return <Story />;
}

declare global {
  interface Window {
    overrideIsWithinIframe?: boolean;
  }
}
function MockIsEmbeddingDecorator(Story: Story) {
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

const store = getStore(publicReducers, initialState);

interface CreateDashboardOpts {
  hasScroll?: boolean;
}
function createDashboard({ hasScroll }: CreateDashboardOpts = {}) {
  return createMockDashboard({
    id: DASHBOARD_ID,
    name: "My dashboard",
    width: "full",
    dashcards: [
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

const Template: ComponentStory<typeof PublicOrEmbeddedDashboardView> = args => {
  return <PublicOrEmbeddedDashboardView {...args} />;
};

const defaultArgs: Partial<
  ComponentProps<typeof PublicOrEmbeddedDashboardView>
> = {
  dashboard: createDashboard(),
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
};

// Light theme
export const LightThemeDefault = Template.bind({});
LightThemeDefault.args = defaultArgs;

export const LightThemeScroll = Template.bind({});
LightThemeScroll.args = {
  ...defaultArgs,
  dashboard: createDashboard({ hasScroll: true }),
};
LightThemeScroll.decorators = [ScrollDecorator];

export const LightThemeNoBackgroundDefault = Template.bind({});
LightThemeNoBackgroundDefault.args = {
  ...defaultArgs,
  background: false,
};

export const LightThemeNoBackgroundScroll = Template.bind({});
LightThemeNoBackgroundScroll.args = {
  ...defaultArgs,
  background: false,
  dashboard: createDashboard({ hasScroll: true }),
};
LightThemeNoBackgroundScroll.decorators = [ScrollDecorator];

// Dark theme
export const DarkThemeDefault = Template.bind({});
DarkThemeDefault.args = {
  ...defaultArgs,
  theme: "night",
};
DarkThemeDefault.decorators = [DarkBackgroundDecorator];

export const DarkThemeScroll = Template.bind({});
DarkThemeScroll.args = {
  ...defaultArgs,
  theme: "night",
  dashboard: createDashboard({ hasScroll: true }),
};
DarkThemeScroll.decorators = [DarkBackgroundDecorator, ScrollDecorator];

export const DarkThemeNoBackgroundDefault = Template.bind({});
DarkThemeNoBackgroundDefault.args = {
  ...defaultArgs,
  theme: "night",
  background: false,
};
DarkThemeNoBackgroundDefault.decorators = [DarkBackgroundDecorator];

export const DarkThemeNoBackgroundScroll = Template.bind({});
DarkThemeNoBackgroundScroll.args = {
  ...defaultArgs,
  theme: "night",
  background: false,
  dashboard: createDashboard({ hasScroll: true }),
};
DarkThemeNoBackgroundScroll.decorators = [
  DarkBackgroundDecorator,
  ScrollDecorator,
];

// Transparent theme
export const TransparentThemeDefault = Template.bind({});
TransparentThemeDefault.args = {
  ...defaultArgs,
  theme: "transparent",
};
TransparentThemeDefault.decorators = [LightBackgroundDecorator];

export const TransparentThemeScroll = Template.bind({});
TransparentThemeScroll.args = {
  ...defaultArgs,
  theme: "transparent",
  dashboard: createDashboard({ hasScroll: true }),
};
TransparentThemeScroll.decorators = [LightBackgroundDecorator, ScrollDecorator];

export const TransparentThemeNoBackgroundDefault = Template.bind({});
TransparentThemeNoBackgroundDefault.args = {
  ...defaultArgs,
  theme: "transparent",
  background: false,
};
TransparentThemeNoBackgroundDefault.decorators = [LightBackgroundDecorator];

export const TransparentThemeNoBackgroundScroll = Template.bind({});
TransparentThemeNoBackgroundScroll.args = {
  ...defaultArgs,
  theme: "transparent",
  background: false,
  dashboard: createDashboard({ hasScroll: true }),
};
TransparentThemeNoBackgroundScroll.decorators = [
  LightBackgroundDecorator,
  ScrollDecorator,
];

const EXPLICIT_SIZE_WAIT_TIME = 300;
function ScrollDecorator(Story: Story) {
  useEffect(() => {
    setTimeout(() => {
      document.querySelector("[data-testid=embed-frame]")?.scrollBy(0, 9999);
    }, EXPLICIT_SIZE_WAIT_TIME);
  }, []);
  return <Story />;
}

function DarkBackgroundDecorator(Story: Story) {
  return (
    <Box bg="#434e56" mih="100vh">
      <Story />
    </Box>
  );
}

function LightBackgroundDecorator(Story: Story) {
  return (
    <Box bg="#ddd" mih="100vh">
      <Story />
    </Box>
  );
}
