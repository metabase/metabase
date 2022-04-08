import React from "react";
import { ComponentStory } from "@storybook/react";
import ObjectDetail from "./ObjectDetail";

export default {
  title: "Visualizations/ObjectDetail",
  component: ObjectDetail,
  argTypes: { onChange: { action: "onChange" } },
};

const Template: ComponentStory<typeof ObjectDetail> = args => {
  return <ObjectDetail {...args} />;
};

Template.args = {
  data: {
    rows: [],
    cols: [],
  },
};
