import { Stack } from "@mantine/core";
import type { StoryFn } from "@storybook/react-webpack5";

import { Repeat } from "./Repeat";
import { Skeleton, type SkeletonProps } from "./Skeleton";

const args: Partial<SkeletonProps> = {
  natural: false,
};

const Template: StoryFn<typeof Skeleton> = (args) => {
  return (
    <Stack gap="sm">
      A column of 10 skeletons
      <Repeat times={10}>
        <Skeleton {...args} />
      </Repeat>
    </Stack>
  );
};

export default {
  title: "Components/Feedback/Skeleton",
  component: Skeleton,
  args,
  render: Template,
};

export const Default = {
  args: {
    natural: false,
    height: "3rem",
    width: "10rem",
  },
};

export const Natural = {
  args: {
    natural: true,
    height: "3rem",
  },
};

export const Circle = {
  args: {
    height: "3rem",
    width: "3rem",
    radius: "50%",
  },
};
