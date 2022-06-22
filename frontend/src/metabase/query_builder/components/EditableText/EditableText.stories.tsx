import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import EditableText from "./EditableText";

export default {
  title: "Query Builder/EditableText",
  component: EditableText,
};

const Template: ComponentStory<typeof EditableText> = args => {
  const [{ initialValue }, updateArgs] = useArgs();
  const handleChange = (value: string | null | undefined) =>
    updateArgs({ initialValue: value });

  console.log(initialValue);

  return <EditableText initialValue={initialValue} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  initialValue:
    "Users with their LTV, Source, and State. Number of new saved questions the last 12 weeks by the method used to create it: GUI or SQL",
};
