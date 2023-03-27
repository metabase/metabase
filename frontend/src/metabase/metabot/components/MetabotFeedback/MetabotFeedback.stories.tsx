import React from "react";
import { useArgs } from "@storybook/client-api";
import type { ComponentStory } from "@storybook/react";
import { MetabotFeedbackType } from "metabase-types/api";
import MetabotFeedback from "./MetabotFeedback";

export default {
  title: "Metabot/MetabotFeedback",
  component: MetabotFeedback,
};

const Template: ComponentStory<typeof MetabotFeedback> = args => {
  const [{ type }, updateArgs] = useArgs();

  const handleTypeChange = (newType: MetabotFeedbackType) => {
    updateArgs({ type: newType });
  };

  return (
    <MetabotFeedback {...args} type={type} onTypeChange={handleTypeChange} />
  );
};

export const Default = Template.bind({});
Default.args = {};
