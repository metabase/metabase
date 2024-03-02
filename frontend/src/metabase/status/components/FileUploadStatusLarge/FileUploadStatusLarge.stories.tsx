import type { ComponentStory } from "@storybook/react";

import { createMockCollection } from "metabase-types/api/mocks";

import FileUploadStatusLarge from "./FileUploadStatusLarge";

export default {
  title: "Status/FileUploadStatusLarge",
  component: FileUploadStatusLarge,
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
  uploadDestination: createMockCollection({ name: "Revenue" }),
  isActive: true,
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
  uploadDestination: createMockCollection({ name: "Revenue" }),
  isActive: true,
};

export const Aborted = Template.bind({});
Aborted.args = {
  uploads: [
    {
      id: 1,
      name: "Marketing UTM Q4 2022",
      status: "error",
      collectionId: "root",
      message: "It's dead Jim",
    },
  ],
  uploadDestination: createMockCollection({ name: "Revenue" }),
  isActive: true,
};
