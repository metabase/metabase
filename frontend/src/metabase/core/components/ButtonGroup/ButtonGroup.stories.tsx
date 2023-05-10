import React from "react";
import type { ComponentStory } from "@storybook/react";
import Button from "../Button";
import ButtonGroup from "./ButtonGroup";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/ButtonGroup",
  component: ButtonGroup,
};

const Template: ComponentStory<typeof ButtonGroup> = args => {
  return (
    <ButtonGroup {...args}>
      <Button>One</Button>
      <Button>Two</Button>
      <Button>Three</Button>
    </ButtonGroup>
  );
};

export const Default = Template.bind({});
