import type { StoryFn } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
} from "__support__/storybook";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { data } from "metabase/static-viz/components/PieChart/stories-data";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import type { Series } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PieChart } from "./PieChart";

export default {
  title: "viz/PieChart",
  component: PieChart,
};

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(PieChart);

const Template: StoryFn = (args) => {
  const { backgroundColor, ...props } = args;

  const theme: MetabaseTheme = {
    colors: {
      charts: [
        "#171938",
        "#BB7A75",
        "#70495C",
        "#3F9DC9",
        "#3E70B9",
        "#535482",
        "#A797C6",
        "#435763",
      ],
    },
    components: {
      dashboard: {
        card: { backgroundColor },
      },
      question: { backgroundColor },
    },
  };

  return (
    <SdkVisualizationWrapper theme={theme}>
      <Box h={500} style={{ backgroundColor }}>
        <Visualization
          {...props}
          rawSeries={data.defaultSettings as unknown as Series}
          width={500}
        />
      </Box>
    </SdkVisualizationWrapper>
  );
};

export const EmbeddedQuestion = {
  render: Template,

  args: {
    isDashboard: false,
    backgroundColor: "#ebe6e2",
  },
};

export const EmbeddedDashcard = {
  render: Template,

  args: {
    isDashboard: true,
    backgroundColor: "#dee9e9",
  },
};

export const DarkTheme: StoryFn = () => (
  <VisualizationWrapper displayTheme="dark">
    <Box h={500}>
      <Visualization rawSeries={data.defaultSettings as unknown as Series} />
    </Box>
  </VisualizationWrapper>
);

export const Watermark: StoryFn = () => (
  <VisualizationWrapper
    initialStore={createMockState({
      settings: createMockSettingsState({
        "token-features": createMockTokenFeatures({
          development_mode: true,
        }),
      }),
    })}
  >
    <Box h={500}>
      <Visualization rawSeries={data.defaultSettings as unknown as Series} />
    </Box>
  </VisualizationWrapper>
);
