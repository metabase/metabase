import type { StoryFn } from "@storybook/react";

import { SdkVisualizationWrapper } from "__support__/storybook";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { data } from "metabase/static-viz/components/PieChart/stories-data";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";

import { PieChart } from "./PieChart";

export default {
  title: "viz/PieChart",
  component: PieChart,
};

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(PieChart);

const Template: StoryFn = args => {
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
          rawSeries={data.defaultSettings}
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

  parameters: {
    // TODO unskip this and the next story once rendering delay is completely gone.
    loki: { skip: true },
  },
};

export const EmbeddedDashcard = {
  render: Template,

  args: {
    isDashboard: true,
    backgroundColor: "#dee9e9",
  },

  parameters: {
    loki: { skip: true },
  },
};
