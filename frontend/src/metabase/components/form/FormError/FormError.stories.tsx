import React from "react";
import { ComponentStory } from "@storybook/react";
import FormError from "./FormError";

export default {
  title: "Form/FormError",
  component: FormError,
};

const Template: ComponentStory<typeof FormError> = args => {
  return <FormError {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  error: "An error occurred",
};

export const LongMessageWithNarrowCard = Template.bind({});
LongMessageWithNarrowCard.decorators = [
  Story => {
    return (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    );
  },
];
LongMessageWithNarrowCard.args = {
  error:
    "We couldn't connect to the SSH tunnel host. Check the Username and Password.",
};
