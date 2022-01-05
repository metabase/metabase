import React from "react";
import { ComponentStory } from "@storybook/react";
import { createMockDatabase } from "metabase-types/api/mocks";
import DatabaseStatusLarge from "./DatabaseStatusLarge";

export default {
  title: "Status/DatabaseStatusLarge",
  component: DatabaseStatusLarge,
  argTypes: { onCollapse: { action: "onCollapse" } },
};

const Template: ComponentStory<typeof DatabaseStatusLarge> = args => {
  return <DatabaseStatusLarge {...args} />;
};

export const Incomplete = Template.bind({});
Incomplete.args = {
  databases: [createMockDatabase({ initial_sync_status: "incomplete" })],
  isActive: true,
};

export const Complete = Template.bind({});
Complete.args = {
  databases: [createMockDatabase({ initial_sync_status: "complete" })],
  isActive: true,
};

export const Aborted = Template.bind({});
Aborted.args = {
  databases: [createMockDatabase({ initial_sync_status: "aborted" })],
  isActive: true,
};
