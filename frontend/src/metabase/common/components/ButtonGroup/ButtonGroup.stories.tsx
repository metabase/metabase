import type { StoryFn } from "@storybook/react";

import { Button } from "../Button";

import { ButtonGroup } from "./ButtonGroup";

export default {
  title: "Deprecated/Components/ButtonGroup",
  component: ButtonGroup,
};

const Template: StoryFn<typeof ButtonGroup> = (args) => {
  return (
    <ButtonGroup {...args}>
      <Button>One</Button>
      <Button>Two</Button>
      <Button>Three</Button>
    </ButtonGroup>
  );
};

export const Default = {
  render: Template,
};
