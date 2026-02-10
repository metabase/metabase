import type { StoryFn } from "@storybook/react-webpack5";

import {
  DownloadsStatusLarge,
  type DownloadsStatusLargeProps,
} from "./DownloadsStatusLarge";

export default {
  title: "Components/Feedback/DownloadsStatusLarge",
  component: DownloadsStatusLarge,
};

const Template: StoryFn<DownloadsStatusLargeProps> = (args) => {
  return <DownloadsStatusLarge {...args} />;
};

export const Incomplete = {
  render: Template,

  args: {
    downloads: [
      {
        id: 1,
        title: "is-alex?.csv",
        status: "in-progress",
      },
      {
        id: 2,
        title: "top-secret.xlsx",
        status: "in-progress",
      },
    ],
  },
};

export const Complete = {
  render: Template,

  args: {
    downloads: [
      {
        id: 1,
        title: "is-alex?.csv",
        status: "complete",
      },
      {
        id: 2,
        title: "top-secret.xlsx",
        status: "complete",
      },
    ],
  },
};

export const Aborted = {
  render: Template,

  args: {
    downloads: [
      {
        id: 1,
        title: "is-alex?.csv",
        status: "error",
        error: "Out of memory: too many people named Alex",
      },
      {
        id: 2,
        title: "top-secret.xlsx",
        status: "error",
      },
    ],
  },
};
