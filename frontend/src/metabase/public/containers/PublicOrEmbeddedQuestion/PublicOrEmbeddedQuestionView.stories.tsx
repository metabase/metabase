// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
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

import {
  PublicOrEmbeddedQuestionView,
  type PublicOrEmbeddedQuestionViewProps,
} from "./PublicOrEmbeddedQuestionView";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(PivotTable);

export default {
  title: "embed/PublicOrEmbeddedQuestionView",
  component: PublicOrEmbeddedQuestionView,
  decorators: [
    ReduxDecorator,
    WaitForResizeToStopDecorator,
    MockIsEmbeddingDecorator,
  ],
  parameters: {
    layout: "fullscreen",
  },
};

function ReduxDecorator(Story: StoryFn) {
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
}

/**
 * This is an arbitrary number, it should be big enough to pass CI tests.
 * This works because we set delays for ExplicitSize to 0 in storybook.
 */
const TIME_UNTIL_ALL_ELEMENTS_STOP_RESIZING = 1000;
function WaitForResizeToStopDecorator(Story: StoryFn) {
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
function MockIsEmbeddingDecorator(Story: StoryFn) {
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

const Template: StoryFn<PublicOrEmbeddedQuestionViewProps> = args => {
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

export const LightThemeDefault = {
  render: Template,
  args: defaultArgs,
};

export const LightThemeDefaultNoResults = {
  render: Template,

  args: {
    ...defaultArgs,
    result: createMockDataset(),
  },
};

export const LightThemeDownload = {
  render: Template,

  args: {
    ...LightThemeDefault.args,
    downloadsEnabled: true,
  },

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const asyncCallback = createAsyncCallback();
    await downloadQuestionAsPng(canvasElement, asyncCallback);
  },
};

export const DarkThemeDefault = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "night",
  },
};

export const DarkThemeDefaultNoResults = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "night",
    result: createMockDataset(),
  },
};

export const DarkThemeDownload = {
  render: Template,

  args: {
    ...DarkThemeDefault.args,
    downloadsEnabled: true,
  },

  play: LightThemeDownload.play,
};

export const TransparentThemeDefault = {
  render: Template,

  args: {
    ...defaultArgs,
    theme: "transparent",
  },

  decorators: [LightBackgroundDecorator],
};

function LightBackgroundDecorator(Story: StoryFn) {
  return (
    <Box bg="#ddd" h="100%">
      <Story />
    </Box>
  );
}

export const PivotTableLightTheme = {
  render: Template,

  args: {
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
  },

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const cell = await within(canvasElement).findByText("field-123");
    (cell.parentNode?.parentNode as HTMLElement).classList.add("pseudo-hover");
  },
};

export const PivotTableDarkTheme = {
  render: Template,

  args: {
    ...PivotTableLightTheme.args,
    theme: "night",
  },

  play: PivotTableLightTheme.play,
};

export const SmartScalarLightTheme = {
  render: Template,

  args: {
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
  },
};

export const SmartScalarDarkTheme = {
  render: Template,

  args: {
    ...SmartScalarLightTheme.args,
    theme: "night",
  },
};

export const SmartScalarLightThemeTooltip = {
  render: Template,

  args: {
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
  },

  decorators: [NarrowContainer],

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const value = "vs. July 21, 2024, 12:00 AM";
    const valueElement = await within(canvasElement).findByText(value);
    await userEvent.hover(valueElement);
    const tooltip = document.documentElement.querySelector(
      '[role="tooltip"]',
    ) as HTMLElement;
    await within(tooltip).findByText(`${value}:`);
  },
};

export const SmartScalarDarkThemeTooltip = {
  render: Template,

  args: {
    ...SmartScalarLightThemeTooltip.args,
    theme: "night",
  },

  decorators: [NarrowContainer],
  play: SmartScalarLightThemeTooltip.play,
};

function NarrowContainer(Story: StoryFn) {
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
  await userEvent.click(documentElement.getByTestId("download-results-button"));
  await canvas.findByTestId("image-downloaded");
  asyncCallback();
};
