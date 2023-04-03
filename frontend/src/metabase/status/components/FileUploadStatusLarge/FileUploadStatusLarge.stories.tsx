import React from "react";
import type { ComponentStory } from "@storybook/react";
import { createMockCollection } from "metabase-types/api/mocks";
import FileUploadStatusLarge from "./FileUploadStatusLarge";

export default {
  title: "Status/FileUploadStatusLarge",
  component: FileUploadStatusLarge,
  argTypes: { onCollapse: { action: "onCollapse" } },
};

const Template: ComponentStory<typeof FileUploadStatusLarge> = args => {
  return <FileUploadStatusLarge {...args} />;
};

export const Incomplete = Template.bind({});
Incomplete.args = {
  uploads: [
    {
      id: 1,
      name: "Marketing UTM Q4 2022",
      status: "in-progress",
      collectionId: "root",
    },
  ],
  collection: createMockCollection({ name: "Revenue" }),
};

export const Complete = Template.bind({});
Complete.args = {
  uploads: [
    {
      id: 1,
      name: "Marketing UTM Q4 2022",
      status: "complete",
      collectionId: "root",
    },
  ],
  collection: createMockCollection({ name: "Revenue" }),
};

export const Aborted = Template.bind({});
Aborted.args = {
  uploads: [
    {
      id: 1,
      name: "Marketing UTM Q4 2022",
      status: "error",
      collectionId: "root",
    },
  ],
  collection: createMockCollection({ name: "Revenue" }),
};
