import type { ComponentStory } from "@storybook/react";
import { useState } from "react";

import type { Timeline } from "metabase-types/api";
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
  const [value, setValue] = useState<Timeline>();
  return <TimelinePicker {...args} value={value} onChange={setValue} />;
};

export const Default = Template.bind({});
Default.args = {
  options: [
    createMockTimeline({
      id: 1,
      name: "Product communications",
      collection: createMockCollection({
        name: "Our analytics",
      }),
    }),
    createMockTimeline({
      id: 2,
      name: "Releases",
      collection: createMockCollection({
        name: "Our analytics",
      }),
    }),
    createMockTimeline({
      id: 3,
      name: "Our analytics events",
      collection: createMockCollection({
        name: "Our analytics",
      }),
    }),
  ],
};
