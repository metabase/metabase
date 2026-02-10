import type { StoryFn } from "@storybook/react-webpack5";
import { useState } from "react";

import type { Timeline } from "metabase-types/api";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";

import TimelinePicker, { type TimelinePickerProps } from "./TimelinePicker";

export default {
  title: "App/Timelines/TimelinePicker",
  component: TimelinePicker,
};

const Template: StoryFn<TimelinePickerProps> = (args) => {
  const [value, setValue] = useState<Timeline>();
  return <TimelinePicker {...args} value={value} onChange={setValue} />;
};

export const Default = {
  render: Template,

  args: {
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
  },
};
