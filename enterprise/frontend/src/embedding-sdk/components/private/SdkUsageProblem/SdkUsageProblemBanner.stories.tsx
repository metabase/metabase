import type { ComponentStory } from "@storybook/react";

import { Box } from "metabase/ui";

import { SdkUsageProblemBanner } from "./SdkUsageProblemBanner";

export default {
  title: "EmbeddingSDK/SdkUsageProblemBanner",
  component: SdkUsageProblemBanner,
};

const Template: ComponentStory<typeof SdkUsageProblemBanner> = args => {
  return (
    <Box pos="absolute" bottom="15px" left="15px">
      <SdkUsageProblemBanner {...args} />
    </Box>
  );
};

const MESSAGE =
  "The embedding SDK is using API keys. This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO.";

export const Warning = Template.bind({});

Warning.args = {
  problem: { severity: "warning", message: MESSAGE },
};

export const Error = Template.bind({});

Error.args = {
  problem: { severity: "error", message: MESSAGE },
};
