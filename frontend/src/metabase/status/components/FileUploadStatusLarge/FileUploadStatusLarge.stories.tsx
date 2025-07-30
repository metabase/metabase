import type { StoryFn } from "@storybook/react-webpack5";

import { createMockCollection } from "metabase-types/api/mocks";

import FileUploadStatusLarge, {
  type FileUploadLargeProps,
} from "./FileUploadStatusLarge";

export default {
  title: "Components/Feedback/FileUploadStatusLarge",
  component: FileUploadStatusLarge,
};

const Template: StoryFn<FileUploadLargeProps> = (args) => {
  return <FileUploadStatusLarge {...args} />;
};

export const Incomplete = {
  render: Template,

  args: {
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
  },
};

export const Complete = {
  render: Template,

  args: {
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
  },
};

export const Aborted = {
  render: Template,

  args: {
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
  },
};
