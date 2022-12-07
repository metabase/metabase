import React from "react";
import type { ComponentStory } from "@storybook/react";
import QueryPreviewCode from "./QueryPreviewCode";

export default {
  title: "QueryBuilder/QueryPreviewCode",
  component: QueryPreviewCode,
};

const Template: ComponentStory<typeof QueryPreviewCode> = args => {
  return <QueryPreviewCode {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  code: "SELECT * FROM ORDERS",
};
