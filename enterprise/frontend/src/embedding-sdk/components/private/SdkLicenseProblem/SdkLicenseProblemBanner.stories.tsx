import type { ComponentStory } from "@storybook/react";

import { Box } from "metabase/ui";

import { SdkLicenseProblemBanner } from "./SdkLicenseProblemBanner";

// eslint-disable-next-line import/no-default-export
export default {
  title: "EmbeddingSDK/SdkLicenseProblemBanner",
  component: SdkLicenseProblemBanner,
};

const Template: ComponentStory<typeof SdkLicenseProblemBanner> = args => {
  return (
    <Box pos="absolute" bottom="15px" left="15px">
      <SdkLicenseProblemBanner {...args} />
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
