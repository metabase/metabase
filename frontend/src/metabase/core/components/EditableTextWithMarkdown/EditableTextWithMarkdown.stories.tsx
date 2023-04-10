import React from "react";
import type { ComponentStory } from "@storybook/react";
import EditableTextWithMarkdown from "./EditableTextWithMarkdown";

export default {
  title: "Core/EditableTextWithMarkdown",
  component: EditableTextWithMarkdown,
};

const Template: ComponentStory<typeof EditableTextWithMarkdown> = args => {
  return <EditableTextWithMarkdown {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  initialValue: `**bold** text

  *multiline*

  and [link](https://metabase.com)`,
  placeholder: "Enter title",
};
