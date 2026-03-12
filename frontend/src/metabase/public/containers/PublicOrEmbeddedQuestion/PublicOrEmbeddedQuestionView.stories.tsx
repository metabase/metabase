// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
import { userEvent, within } from "@storybook/test";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";

import { getStore } from "__support__/entities-store";
import { createMockMetadata } from "__support__/metadata";
import { createWaitForResizeToStopDecorator } from "__support__/storybook";
import { getNextId } from "__support__/utils";
import {
  DateTimeColumn,
  NumberColumn,
  StringColumn,
} from "__support__/visualizations";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { publicReducers } from "metabase/reducers-public";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import { PivotTable } from "metabase/visualizations/visualizations/PivotTable";
import { PIVOT_TABLE_MOCK_DATA } from "metabase/visualizations/visualizations/PivotTable/pivot-table-test-mocks";
import { SmartScalar } from "metabase/visualizations/visualizations/SmartScalar";
import { Table } from "metabase/visualizations/visualizations/Table/Table";
import * as TABLE_MOCK_DATA from "metabase/visualizations/visualizations/Table/stories-data";
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
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(SmartScalar);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(BarChart);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Table);

export default {
  title: "App/Embed/PublicOrEmbeddedQuestionView",
  component: PublicOrEmbeddedQuestionView,
  decorators: [ReduxDecorator, createWaitForResizeToStopDecorator()],
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.get(
          "/api/user-key-value/namespace/last_download_format/key/download_format_preference",
          () =>
            HttpResponse.json({
              last_download_format: "csv",
              last_table_download_format: "csv",
            }),
        ),
        http.put(
          "/api/user-key-value/namespace/last_download_format/key/download_format_preference",
          () =>
            HttpResponse.json({
              last_download_format: "csv",
              last_table_download_format: "csv",
            }),
        ),
      ],
    },
  },
};

function ReduxDecorator(Story: StoryFn) {
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
}

const CARD_BAR_ID = getNextId();
const initialState = createMockState({
  settings: createMockSettingsState({
    "hide-embed-branding?": false,
  }),
});

const store = getStore(publicReducers, initialState, [Api.middleware]);

const Template: StoryFn<PublicOrEmbeddedQuestionViewProps> = (args) => {
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
  downloadsEnabled: { pdf: true, results: true },
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
    downloadsEnabled: { pdf: true, results: true },
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
    downloadsEnabled: { pdf: true, results: true },
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
    <Box bg="background-primary" h="100%">
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
  parameters: {
    loki: { skip: true },
  },

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
  parameters: {
    loki: { skip: true },
  },

  render: Template,

  args: {
    ...SmartScalarLightThemeTooltip.args,
    theme: "night",
  },

  decorators: [NarrowContainer],
  play: SmartScalarLightThemeTooltip.play,
};

export const TableLightTheme = {
  render: Template,

  args: {
    ...defaultArgs,
    titled: false,
    card: createMockCard({
      id: getNextId(),
      display: "table",
      ...(TABLE_MOCK_DATA.variousColumnSettings[0].card as any),
    }),
    result: createMockDataset({
      data: createMockDatasetData(
        TABLE_MOCK_DATA.variousColumnSettings[0].data as any,
      ),
    }),
  },
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

  const downloadButton = await canvas.findByTestId(
    "question-results-download-button",
  );
  await userEvent.click(downloadButton!);

  const documentElement = within(document.documentElement);
  const pngButton = await documentElement.findByText(".png");
  await userEvent.click(pngButton);
  await userEvent.click(
    await documentElement.findByTestId("download-results-button"),
  );
  await canvas.findByTestId("image-downloaded");
  asyncCallback();
};
