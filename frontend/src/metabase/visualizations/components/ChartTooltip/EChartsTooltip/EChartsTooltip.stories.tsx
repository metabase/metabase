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

const DefaultTemplate = () => (
  <Flex align="center" justify="center" p="xl" h="400px">
    <Box className={S.ChartTooltipRoot}>
      <EChartsTooltip {...data} />
    </Box>
  </Flex>
);

export default {
  title: "viz/EChartsTooltip",
  component: EChartsTooltip,
};

export const Default = { render: DefaultTemplate };

export const LightTheme = {
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
