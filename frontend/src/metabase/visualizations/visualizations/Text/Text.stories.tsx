import type { StoryFn } from "@storybook/react-webpack5";

import { VisualizationWrapper } from "__support__/storybook";
import { Box } from "metabase/ui";

import { Text } from "./Text";

export default {
  title: "viz/Text",
  component: Text,
};

const Template: StoryFn = ({ align }: { align?: string }) => {
  return (
    <VisualizationWrapper>
      <Box h={300} w={300}>
        {/* @ts-expect-error Text is still a js component */}
        <Text
          settings={{
            virtual_card: {
              name: null,
              display: "text",
            },
            "text.align_horizontal": align,
            text: "long text long text long text long text long text long text long text long text long text long text long text",
          }}
        />
      </Box>
    </VisualizationWrapper>
  );
};

export const Default = {
  render: Template,
  args: {},
};

export const RightAlign = {
  render: Template,
  args: { align: "right" },
};

export const CenterAlign = {
  render: Template,
  args: { align: "center" },
};
