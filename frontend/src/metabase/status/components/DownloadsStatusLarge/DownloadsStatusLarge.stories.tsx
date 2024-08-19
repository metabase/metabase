import type { ComponentStory } from "@storybook/react";

import { DownloadsStatusLarge } from "./DownloadsStatusLarge";

export default {
  title: "Status/DownloadsStatusLarge",
  component: DownloadsStatusLarge,
};

const Template: ComponentStory<typeof DownloadsStatusLarge> = args => {
  return <DownloadsStatusLarge {...args} />;
};

export const Incomplete = Template.bind({});
Incomplete.args = {
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
};

export const Complete = Template.bind({});
Complete.args = {
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
};

export const Aborted = Template.bind({});
Aborted.args = {
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
};
