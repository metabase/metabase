import type { Store } from "@reduxjs/toolkit";
import type { StoryFn } from "@storybook/react";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
  createWaitForResizeToStopDecorator,
} from "__support__/storybook";
import { Api } from "metabase/api";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import type { ColorName } from "metabase/lib/colors/types";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { commonReducers } from "metabase/reducers-common";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import Table from "metabase/visualizations/visualizations/Table/Table";
import type { RawSeries } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import * as data from "./stories-data";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Table);

const settings = mockSettings();

const storeInitialState = createMockState({
  settings,
  entities: createMockEntitiesState({}),
});
const publicReducerNames = Object.keys(commonReducers);
const initialState = _.pick(storeInitialState, ...publicReducerNames) as State;

const storeMiddleware = [Api.middleware];

const store = getStore(
  commonReducers,
  initialState,
  storeMiddleware,
) as unknown as Store<State>;

export default {
  title: "viz/Table",
  decorators: [createWaitForResizeToStopDecorator()],
};

const DefaultTemplate: StoryFn<{
  series: RawSeries;
  isDashboard?: boolean;
}> = ({
  series,
  isDashboard,
  bgColor = "white",
  theme,
  hasDevWatermark,
}: {
  series: RawSeries;
  isDashboard?: boolean;
  bgColor?: ColorName;
  theme?: MetabaseTheme;
  hasDevWatermark?: boolean;
}) => {
  const storyContent = (
    <Box h="calc(100vh - 2rem)" bg={bgColor}>
      <Visualization rawSeries={series} isDashboard={isDashboard} />,
    </Box>
  );

  const initialStore = hasDevWatermark
    ? createMockState({
        settings: createMockSettingsState({
          "token-features": createMockTokenFeatures({
            development_mode: true,
          }),
        }),
      })
    : undefined;

  if (theme != null) {
    return (
      <SdkVisualizationWrapper theme={theme} initialStore={initialStore}>
        {storyContent}
      </SdkVisualizationWrapper>
    );
  }

  return (
    <VisualizationWrapper initialStore={initialStore}>
      {storyContent}
    </VisualizationWrapper>
  );
};

const ColumnFormattingTemplate: StoryFn<{
  series: RawSeries;
}> = ({ series }: { series: RawSeries }) => {
  return (
    <MetabaseReduxProvider store={store}>
      <Box h="calc(100vh - 2rem)">
        <Visualization rawSeries={series} />,
      </Box>
    </MetabaseReduxProvider>
  );
};

export const DefaultTable = {
  parameters: {
    loki: { skip: true },
  },
  render: DefaultTemplate,
  args: {
    series: data.variousColumnSettings,
  },
};
const ordersWithPeople = data.ordersWithPeople[0];
const CONDITIONA_FORMATTING_SERIES = [
  {
    ...ordersWithPeople,
    data: {
      ...ordersWithPeople.data,
      rows: ordersWithPeople.data.rows.slice(0, 12),
    },
    card: {
      ...ordersWithPeople.card,
      visualization_settings: {
        "table.column_formatting": [
          {
            columns: ["SUBTOTAL"],
            type: "range",
            colors: ["transparent", "#F9D45C"],
            min_type: null,
            max_type: null,
            min_value: 0,
            max_value: 100,
            operator: "=",
          },
          {
            columns: ["TOTAL"],
            type: "single",
            operator: ">",
            value: 100,
            color: "#7172AD",
            highlight_row: true,
          },
          {
            columns: ["QUANTITY"],
            type: "range",
            colors: [
              "hsla(358, 71%, 62%, 1)",
              "transparent",
              "hsla(89, 48%, 40%, 1)",
            ],
            min_type: null,
            max_type: null,
            min_value: 0,
            max_value: 100,
          },
        ],
      },
    },
  },
];

export const ConditionalFomattingLight = {
  parameters: {
    layout: "fullscreen",
  },
  render: ColumnFormattingTemplate,
  args: {
    theme: "light",
    series: CONDITIONA_FORMATTING_SERIES,
  },
};

export const ConditionalFomattingDark = {
  parameters: {
    layout: "fullscreen",
  },
  render: ColumnFormattingTemplate,
  args: {
    theme: "dark",
    series: CONDITIONA_FORMATTING_SERIES,
  },
};

export const TableWithImages = {
  render: DefaultTemplate,
  args: {
    series: data.images,
  },
};

export const TableWithWrappedLinks = {
  render: DefaultTemplate,
  args: {
    series: data.wrappedLinks,
  },
};

export const DashboardTable = {
  render: DefaultTemplate,
  args: {
    series: data.ordersWithPeople,
    isDashboard: true,
  },
};

export const DashboardTableEmbeddingTheme = {
  render: DefaultTemplate,
  args: {
    series: data.ordersWithPeople,
    isDashboard: true,
    theme: {
      colors: {
        brand: "#eccc68",
        "text-primary": "#4c5773",
        "text-secondary": "#696e7b",
        "text-tertiary": "#ffffff",
      },
      components: {
        dashboard: {
          card: { backgroundColor: "#2f3542" },
        },
        table: {
          cell: { textColor: "#dfe4ea", backgroundColor: "#2f3640" },
          idColumn: { textColor: "#fff", backgroundColor: "#eccc6855" },
        },
      },
    },
    hasDevWatermark: false,
  },
};

export const DashboardTableEmbeddingThemeWithDarkBackground = {
  render: (args: any) => {
    return (
      <div style={{ backgroundColor: "#2f3542", padding: "1rem" }}>
        <DefaultTemplate {...args} />
      </div>
    );
  },
  args: {
    series: data.ordersWithPeople,
    bgColor: "transparent",
    isDashboard: true,
    theme: {},
    hasDevWatermark: false,
  },
};

export const DashboardTableEmbeddingThemeWithStickyBackgroundColor = {
  render: DefaultTemplate,
  args: {
    series: data.ordersWithPeople,
    isDashboard: true,
    theme: {
      components: {
        table: {
          stickyBackgroundColor: "#dbdbdb",
        },
      },
    },
  },
};

export const DashboardTableWithRowId = {
  render: DefaultTemplate,
  args: {
    series: data.groupedOrders,
    isDashboard: true,
  },
};

export const PreserveWhitespaceWrapped = {
  parameters: {
    loki: { skip: true },
  },
  render: DefaultTemplate,
  args: {
    series: data.preserveWhitespaceWrapped,
  },
};

export const PreserveWhitespaceUnwrapped = {
  render: DefaultTemplate,
  args: {
    series: data.preserveWhitespaceUnwrapped,
  },
};

export const Watermark = {
  parameters: {
    loki: { skip: true },
  },
  render: DefaultTemplate,
  args: {
    series: data.variousColumnSettings,
    hasDevWatermark: true,
  },
};
