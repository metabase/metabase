import React from "react";
import { ComponentStory } from "@storybook/react";
import { createMockDatabase, createMockEngine } from "metabase-types/api/mocks";
import DriverWarning from "./DriverWarning";

export default {
  title: "Components/DriverWarning",
  component: DriverWarning,
  argTypes: { onChange: { action: "onChange" } },
};

const Template: ComponentStory<typeof DriverWarning> = args => {
  return <DriverWarning {...args} />;
};
Template.args = {
  engines: {
    presto: createMockEngine({
      "display-name": "Presto (Deprecated Driver)",
      "superseded-by": "presto-jdbc",
    }),
    "presto-jdbc": createMockEngine({
      "display-name": "Presto",
    }),
  },
};

export const New = Template.bind({});
New.args = {
  engine: "presto-jdbc",
  ...Template.args,
};

export const Deprecated = Template.bind({});
Deprecated.args = {
  engine: "presto",
  ...Template.args,
};
