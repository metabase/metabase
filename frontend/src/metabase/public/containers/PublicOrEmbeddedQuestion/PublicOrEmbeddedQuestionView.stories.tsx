// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { ComponentStory, Story } from "@storybook/react";
import { userEvent, within } from "@storybook/testing-library";
import { type ComponentProps, useEffect } from "react";
import { Provider } from "react-redux";

import { getStore } from "__support__/entities-store";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import {
  DateTimeColumn,
  NumberColumn,
  StringColumn,
} from "__support__/visualizations";
import { waitTimeContext } from "metabase/context/wait-time";
import { publicReducers } from "metabase/reducers-public";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import PivotTable from "metabase/visualizations/visualizations/PivotTable";
import { PIVOT_TABLE_MOCK_DATA } from "metabase/visualizations/visualizations/PivotTable/pivot-table-test-mocks";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PublicOrEmbeddedQuestionView } from "./PublicOrEmbeddedQuestionView";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(PivotTable);

export default {
  title: "embed/PublicOrEmbeddedQuestionView",
  component: PublicOrEmbeddedQuestionView,
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

const CARD_BAR_ID = getNextId();
const initialState = createMockState({
  settings: createMockSettingsState({
    "hide-embed-branding?": false,
  }),
});

const store = getStore(publicReducers, initialState);

const Template: ComponentStory<typeof PublicOrEmbeddedQuestionView> = args => {
  return <PublicOrEmbeddedQuestionView {...args} />;
};

const defaultArgs: Partial<
  ComponentProps<typeof PublicOrEmbeddedQuestionView>
> = {
  card: createMockCard({ id: CARD_BAR_ID, name: "Bar", display: "bar" }),
  metadata: createMockMetadata({}),
  titled: true,
  bordered: true,
  getParameters: () => [],
  setCard: () => {},
  result: createMockDataset({
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
};

// Light theme
export const LightThemeDefault = Template.bind({});
LightThemeDefault.args = defaultArgs;

export const LightThemeDefaultNoResults = Template.bind({});
LightThemeDefaultNoResults.args = {
  ...defaultArgs,
  result: createMockDataset(),
};

export const LightThemeDownload = Template.bind({});
LightThemeDownload.args = {
  ...LightThemeDefault.args,
  downloadsEnabled: true,
};
LightThemeDownload.play = async ({ canvasElement }) => {
  const asyncCallback = createAsyncCallback();
  await downloadQuestionAsPng(canvasElement, asyncCallback);
};

// Dark theme
export const DarkThemeDefault = Template.bind({});
DarkThemeDefault.args = {
  ...defaultArgs,
  theme: "night",
};

export const DarkThemeDefaultNoResults = Template.bind({});
DarkThemeDefaultNoResults.args = {
  ...defaultArgs,
  theme: "night",
  result: createMockDataset(),
};

export const DarkThemeDownload = Template.bind({});
DarkThemeDownload.args = {
  ...DarkThemeDefault.args,
  downloadsEnabled: true,
};
DarkThemeDownload.play = LightThemeDownload.play;

// Transparent theme
export const TransparentThemeDefault = Template.bind({});
TransparentThemeDefault.args = {
  ...defaultArgs,
  theme: "transparent",
};
TransparentThemeDefault.decorators = [LightBackgroundDecorator];

function LightBackgroundDecorator(Story: Story) {
  return (
    <Box bg="#ddd" h="100%">
      <Story />
    </Box>
  );
}

// Pivot table

// Light theme
export const PivotTableLightTheme = Template.bind({});
PivotTableLightTheme.args = {
  ...defaultArgs,
  card: createMockCard({
    id: getNextId(),
    display: "pivot",
    visualization_settings: PIVOT_TABLE_MOCK_DATA.settings,
  }),
  result: createMockDataset({
    data: createMockDatasetData({
      cols: PIVOT_TABLE_MOCK_DATA.cols,
      rows: PIVOT_TABLE_MOCK_DATA.rows,
    }),
  }),
};
PivotTableLightTheme.play = async ({ canvasElement }) => {
  const cell = await within(canvasElement).findByText("field-123");
  (cell.parentNode?.parentNode as HTMLElement).classList.add("pseudo-hover");
};

// Dark theme
export const PivotTableDarkTheme = Template.bind({});
PivotTableDarkTheme.args = {
  ...PivotTableLightTheme.args,
  theme: "night",
};
PivotTableDarkTheme.play = PivotTableLightTheme.play;

// Smart scalar

// Light theme
export const SmartScalarLightTheme = Template.bind({});
SmartScalarLightTheme.args = {
  ...defaultArgs,
  card: createMockCard({
    id: getNextId(),
    display: "smartscalar",
    visualization_settings: {
      "graph.dimensions": ["timestamp"],
      "graph.metrics": ["count"],
    },
  }),
  result: createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn(DateTimeColumn({ name: "Timestamp" })),
        createMockColumn(NumberColumn({ name: "Count" })),
      ],
      insights: [
        {
          "previous-value": 150,
          unit: "week",
          offset: -199100,
          "last-change": 0.4666666666666667,
          col: "count",
          slope: 10,
          "last-value": 220,
          "best-fit": ["+", -199100, ["*", 10, "x"]],
        },
      ],
      rows: [
        ["2024-07-21T00:00:00Z", 150],
        ["2024-07-28T00:00:00Z", 220],
      ],
    }),
  }),
};

// Dark theme
export const SmartScalarDarkTheme = Template.bind({});
SmartScalarDarkTheme.args = {
  ...SmartScalarLightTheme.args,
  theme: "night",
};

// Light theme tooltip
export const SmartScalarLightThemeTooltip = Template.bind({});
SmartScalarLightThemeTooltip.args = {
  ...defaultArgs,
  card: createMockCard({
    id: getNextId(),
    display: "smartscalar",
    visualization_settings: {
      "graph.dimensions": ["timestamp"],
      "graph.metrics": ["count"],
    },
  }),
  result: createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn(DateTimeColumn({ name: "Timestamp" })),
        createMockColumn(NumberColumn({ name: "Count" })),
      ],
      insights: [
        {
          "previous-value": 150,
          unit: "week",
          offset: -199100,
          "last-change": 0.4666666666666667,
          col: "count",
          slope: 10,
          "last-value": 220,
          "best-fit": ["+", -199100, ["*", 10, "x"]],
        },
      ],
      rows: [
        ["2024-07-21T00:00:00Z", 150],
        ["2024-07-28T00:00:00Z", 220],
      ],
    }),
  }),
};
SmartScalarLightThemeTooltip.decorators = [NarrowContainer];
SmartScalarLightThemeTooltip.play = async ({ canvasElement }) => {
  const value = "vs. July 21, 2024, 12:00 AM";
  const valueElement = await within(canvasElement).findByText(value);
  await userEvent.hover(valueElement);
  const tooltip = document.documentElement.querySelector(
    '[role="tooltip"]',
  ) as HTMLElement;
  await within(tooltip).findByText(`${value}:`);
};

// Dark theme tooltip
export const SmartScalarDarkThemeTooltip = Template.bind({});
SmartScalarDarkThemeTooltip.args = {
  ...SmartScalarLightThemeTooltip.args,
  theme: "night",
};
SmartScalarDarkThemeTooltip.decorators = [NarrowContainer];
SmartScalarDarkThemeTooltip.play = SmartScalarLightThemeTooltip.play;

function NarrowContainer(Story: Story) {
  return (
    <Box w="300px" h="250px" pos="relative">
      <Story />
    </Box>
  );
}

const downloadQuestionAsPng = async (
  canvasElement: HTMLElement,
  asyncCallback: () => void,
) => {
  const canvas = within(canvasElement);

  const downloadButton = await canvas.findByTestId("download-button");
  await userEvent.click(downloadButton!);

  const documentElement = within(document.documentElement);
  const pngButton = await documentElement.findByText(".png");
  await userEvent.click(pngButton);
  await canvas.findByTestId("image-downloaded");
  asyncCallback();
};
