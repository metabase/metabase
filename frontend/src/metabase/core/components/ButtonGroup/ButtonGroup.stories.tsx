import React from "react";
import { ComponentStory } from "@storybook/react";
import Button from "metabase/core/components/Button";
import ButtonGroup from "./ButtonGroup";

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
