import type { ComponentStory } from "@storybook/react";

import { SdkVisualizationWrapper } from "__support__/storybook";
import { color } from "metabase/lib/colors";
import { measureTextWidth } from "metabase/lib/measure-text";
import { getStaticChartTheme } from "metabase/static-viz/components/RowChart/theme";
import { Box } from "metabase/ui";
import { useRowChartTheme } from "metabase/visualizations/visualizations/RowChart/utils/theme";

import { RowChart } from "./RowChart";

export default {
  title: "Visualizations/shared/RowChart",
  component: RowChart,
};

const Template: ComponentStory<typeof RowChart> = args => {
  return (
    <Box h={600} bg="white" p="8px">
      <RowChart {...args} />
    </Box>
  );
};

const DEFAULT_ROW_CHART_ARGS = {
  width: 800,
  height: 400,
  data: [
    {
      y: "Gizmo",
      x1: 110,
      x2: 45,
    },
    {
      y: "Gadget",
      x1: 120,
      x2: 46,
    },
    {
      y: "Doohickey",
      x1: 30,
      x2: 56,
    },
    {
      y: "Widget",
      x1: 80,
      x2: 60,
    },
  ],
  series: [
    {
      seriesKey: "count",
      seriesName: "Count",
      xAccessor: (datum: any) => datum.x1,
      yAccessor: (datum: any) => datum.y,
    },
    {
      seriesKey: "avg",
      seriesName: "Average of something",
      xAccessor: (datum: any) => datum.x2,
      yAccessor: (datum: any) => datum.y,
    },
  ],
  seriesColors: {
    count: color("accent3"),
    avg: color("accent1"),
  },

  goal: {
    label: "Very very very long goal label",
    value: 100,
  },

  xLabel: "X Label",
  yLabel: "Y Label",

  theme: getStaticChartTheme(color),

  measureTextWidth,

  style: { fontFamily: "Lato" },
};

export const Default = Template.bind({});
Default.args = DEFAULT_ROW_CHART_ARGS;

const ThemedRowChart = () => {
  const theme = useRowChartTheme("Lato", false, false);

  return (
    <Box h={600} bg="white" p="8px">
      <RowChart {...DEFAULT_ROW_CHART_ARGS} theme={theme} stackOffset={null} />
    </Box>
  );
};

export const HugeFont = () => (
  <SdkVisualizationWrapper theme={{ fontSize: "20px" }}>
    <ThemedRowChart />
  </SdkVisualizationWrapper>
);
