import React from "react";
import { ComponentStory } from "@storybook/react";
import { createDatabase } from "metabase-types/api/database";
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
  databases: [createDatabase({ initial_sync_status: "incomplete" })],
};

export const Complete = Template.bind({});
Complete.args = {
  databases: [createDatabase({ initial_sync_status: "complete" })],
};

export const Aborted = Template.bind({});
Aborted.args = {
  databases: [createDatabase({ initial_sync_status: "aborted" })],
};
