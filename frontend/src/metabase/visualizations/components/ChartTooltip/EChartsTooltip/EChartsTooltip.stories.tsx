import { SdkVisualizationWrapper } from "__support__/storybook";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { defineMetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box, Flex } from "metabase/ui";

import { EChartsTooltip, type EChartsTooltipProps } from "./EChartsTooltip";
import S from "./EChartsTooltip.module.css";

const data: EChartsTooltipProps = {
  header: "Header Text",
  rows: [
    { name: "Foo", values: ["Foo Row"] },
    { name: "Focused", values: ["Focused Row"], isFocused: true },
  ],
};

const stackedData: EChartsTooltipProps = {
  header: "Header Text",
  rows: [
    {
      isFocused: false,
      name: "Doohickey",
      markerColorClass: "marker-7172AD",
      values: ["93", "22.57 %"],
    },
    {
      isFocused: true,
      name: "Gadget",
      markerColorClass: "marker-999AC4",
      values: ["113", "27.43 %"],
    },
    {
      isFocused: false,
      name: "Gizmo",
      markerColorClass: "marker-C7EAEA",
      values: ["107", "25.97 %"],
    },
    {
      isFocused: false,
      name: "Widget",
      markerColorClass: "marker-227FD2",
      values: ["99", "24.03 %"],
    },
  ],
};

const DefaultTemplate = () => (
  <Flex align="center" justify="center" p="xl" h="400px">
    <Box className={S.ChartTooltipRoot}>
      <EChartsTooltip {...data} />
    </Box>
  </Flex>
);

const StackedTemplate = () => (
  <Flex align="center" justify="center" p="xl" h="400px">
    <Box className={S.ChartTooltipRoot}>
      <EChartsTooltip {...stackedData} />
    </Box>
  </Flex>
);

export default {
  parameters: {
    loki: { skip: true },
  },
  title: "Viz/Components/EChartsTooltip",
  component: EChartsTooltip,
};

export const Default = { render: DefaultTemplate };

export const Stacked = { render: StackedTemplate };

export const LightTheme = {
  parameters: {
    loki: { skip: true },
  },
  render: ({ theme }: { theme: MetabaseTheme }) => (
    <SdkVisualizationWrapper theme={theme}>
      <DefaultTemplate />
    </SdkVisualizationWrapper>
  ),
  args: {
    theme: defineMetabaseTheme({
      components: {
        tooltip: {
          textColor: "#2f3542",
          secondaryTextColor: "#57606f",
          backgroundColor: "#ffffff",
          focusedBackgroundColor: "#f1f2f6",
        },
      },
    }),
  },
};
