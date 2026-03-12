import { Timeline, type TimelineProps } from "metabase/ui";
import { Box, Text } from "metabase/ui";

const args = {
  active: 1,
  align: "left",
  bulletSize: 20,
  lineWidth: 2,
  color: "var(--mb-color-brand)",
};

const argTypes = {
  active: {
    control: { type: "number" },
  },
  align: {
    options: ["left", "right"],
    control: { type: "inline-radio" },
  },
  bulletSize: {
    control: { type: "number" },
  },
  lineWidth: {
    control: { type: "number" },
  },
  color: {
    control: { type: "color" },
  },
};

export default {
  title: "Components/Data display/Timeline",
  component: Timeline,
  args,
  argTypes,
};

export const Default = {
  render: (args: TimelineProps) => (
    <Box maw="20rem">
      <Timeline {...args}>
        <Timeline.Item>
          <Text fw="bold">New branch</Text>
          <Text>You have created new branch fix-notifications from master</Text>
        </Timeline.Item>
        <Timeline.Item>
          <Text fw="bold">Commits</Text>
          <Text>You have pushed 23 commits to fix-notifications branch</Text>
        </Timeline.Item>
        <Timeline.Item>
          <Text fw="bold">Merge</Text>
          <Text>
            You have merged fix-notifications branch into master branch
          </Text>
        </Timeline.Item>
      </Timeline>
    </Box>
  ),
};
