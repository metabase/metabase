// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { ComponentStory, Story } from "@storybook/react";
import { within, userEvent } from "@storybook/testing-library";
import { useEffect, type ComponentProps } from "react";
import { Provider } from "react-redux";

import { getStore } from "__support__/entities-store";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { explicitSizeRefreshModeContext } from "metabase/components/ExplicitSize/context";
import { getDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { publicReducers } from "metabase/reducers-public";
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
import { PRODUCTS } from "metabase-types/api/mocks/presets";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

export default {
  title: "embed/PublicOrEmbeddedDashboardView/filters",
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
    <explicitSizeRefreshModeContext.Provider value="none">
      <Story />
    </explicitSizeRefreshModeContext.Provider>
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
    parameters: [
      createMockParameter({
        id: PARAMETER_ID,
        name: "Category",
        slug: "category",
      }),
    ],
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
            target: [
              "dimension",
              ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
            ],
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

type ArgType = Partial<ComponentProps<typeof PublicOrEmbeddedDashboardView>>;

const createDefaultArgs = (args: ArgType = {}): ArgType => {
  const dashboard = createDashboard();
  return {
    dashboard,
    titled: true,
    bordered: true,
    background: true,
    slowCards: {},
    selectedTabId: TAB_ID,
    parameters: getDashboardUiParameters(
      dashboard.dashcards,
      dashboard.parameters,
      createMockMetadata({}),
      {},
    ),
    ...args,
  };
};

// Light theme
export const LightThemeText = Template.bind({});
LightThemeText.args = createDefaultArgs();
LightThemeText.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
};

export const LightThemeTextWithValue = Template.bind({});
LightThemeTextWithValue.args = createDefaultArgs();
LightThemeTextWithValue.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
  const documentElement = within(document.documentElement);
  await userEvent.type(
    documentElement.getByPlaceholderText("Enter some text"),
    "filter value",
  );
  await userEvent.tab();
};

// Dark theme
export const DarkThemeText = Template.bind({});
DarkThemeText.args = createDefaultArgs({ theme: "night" });
DarkThemeText.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
};

export const DarkThemeTextWithValue = Template.bind({});
DarkThemeTextWithValue.args = createDefaultArgs({ theme: "night" });
DarkThemeTextWithValue.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
  const documentElement = within(document.documentElement);
  await userEvent.type(
    documentElement.getByPlaceholderText("Enter some text"),
    "filter value",
  );
  await userEvent.tab();
};
