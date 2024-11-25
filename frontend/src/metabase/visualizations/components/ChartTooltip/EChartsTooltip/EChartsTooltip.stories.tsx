import { SdkVisualizationWrapper } from "__support__/storybook";
import { type MetabaseTheme, defineEmbeddingSdkTheme } from "embedding-sdk";
import { Flex, Tooltip } from "metabase/ui";

import { EChartsTooltip, type EChartsTooltipProps } from "./EChartsTooltip";

const data: EChartsTooltipProps = {
  header: "Header Text",
  rows: [
    { name: "Foo", values: ["Foo Row"] },
    { name: "Focused", values: ["Focused Row"], isFocused: true },
  ],
};

const DefaultTemplate = () => (
  <Flex align="center" justify="center" p="xl" h="400px">
    <Tooltip label={<EChartsTooltip {...data} />} opened>
      <div>Tooltip Target</div>
    </Tooltip>
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
    theme: defineEmbeddingSdkTheme({
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
