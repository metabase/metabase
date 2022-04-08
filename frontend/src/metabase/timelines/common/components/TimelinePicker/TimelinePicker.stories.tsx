import React from "react";
import { ComponentStory } from "@storybook/react";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";
import TimelinePicker from "./TimelinePicker";

export default {
  title: "Timelines/TimelinePicker",
  component: TimelinePicker,
};

const Template: ComponentStory<typeof TimelinePicker> = args => {
  return <TimelinePicker {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  options: [
    createMockTimeline({
      name: "Product communications",
      collection: createMockCollection({
        name: "Our analytics",
      }),
    }),
  ],
};
