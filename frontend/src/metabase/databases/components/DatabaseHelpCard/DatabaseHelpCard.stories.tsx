import type { ComponentStory } from "@storybook/react";
import DatabaseHelpCard from "./DatabaseHelpCard";

export default {
  title: "Databases/DatabaseHelpCard",
  component: DatabaseHelpCard,
};

const Template: ComponentStory<typeof DatabaseHelpCard> = args => {
  return <DatabaseHelpCard {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  isHosted: false,
};

export const Cloud = Template.bind({});
Cloud.args = {
  isHosted: true,
};
