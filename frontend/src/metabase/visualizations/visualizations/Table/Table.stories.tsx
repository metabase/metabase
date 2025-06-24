import type { StoryFn } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
  createWaitForResizeToStopDecorator,
} from "__support__/storybook";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import Table from "metabase/visualizations/visualizations/Table/Table";
import type { RawSeries } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import * as data from "./stories-data";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Table);

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
  bgColor?: string;
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
            "development-mode": true,
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

export const DefaultTable = {
  parameters: {
    loki: { skip: true },
  },
  render: DefaultTemplate,
  args: {
    series: data.variousColumnSettings,
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
