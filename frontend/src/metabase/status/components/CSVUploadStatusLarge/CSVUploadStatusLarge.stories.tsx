import React from "react";
import type { ComponentStory } from "@storybook/react";
import CSVUploadStatusLarge from "./CSVUploadStatusLarge";

export default {
  title: "Status/CSVUploadStatusLarge",
  component: CSVUploadStatusLarge,
  argTypes: { onCollapse: { action: "onCollapse" } },
};

const Template: ComponentStory<typeof CSVUploadStatusLarge> = args => {
  return <CSVUploadStatusLarge {...args} />;
};

export const Incomplete = Template.bind({});
Incomplete.args = {
  uploads: [{ id: 1, name: "Marketing UTM Q4 2022", status: "in-progress" }],
  collection: { name: "Revenue" },
  isActive: true,
};

export const Complete = Template.bind({});
Complete.args = {
  uploads: [{ id: 1, name: "Marketing UTM Q4 2022", status: "complete" }],
  collection: { name: "Revenue" },
  isActive: true,
};

export const Aborted = Template.bind({});
Aborted.args = {
  uploads: [{ id: 1, name: "Marketing UTM Q4 2022", status: "error" }],
  collection: { name: "Revenue" },
  isActive: true,
};
