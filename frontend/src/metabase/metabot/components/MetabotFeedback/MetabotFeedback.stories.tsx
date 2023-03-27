import React, { useState } from "react";
import type { ComponentStory } from "@storybook/react";
import { MetabotFeedbackType } from "metabase-types/api";
import MetabotFeedback from "./MetabotFeedback";

export default {
  title: "Metabot/MetabotFeedback",
  component: MetabotFeedback,
};

const Template: ComponentStory<typeof MetabotFeedback> = args => {
  const [type, setType] = useState<MetabotFeedbackType>();

  return <MetabotFeedback {...args} type={type} onTypeChange={setType} />;
};

export const Default = Template.bind({});
Default.args = {};
