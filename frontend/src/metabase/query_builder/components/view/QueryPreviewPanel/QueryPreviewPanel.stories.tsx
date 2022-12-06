import React from "react";
import type { ComponentStory } from "@storybook/react";
import QueryPreviewPanel from "./QueryPreviewPanel";

export default {
  title: "QueryBuilder/QueryPreviewPanel",
  component: QueryPreviewPanel,
};

const Template: ComponentStory<typeof QueryPreviewPanel> = args => {
  return <QueryPreviewPanel {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  code: "SELECT * FROM ORDERS",
};
