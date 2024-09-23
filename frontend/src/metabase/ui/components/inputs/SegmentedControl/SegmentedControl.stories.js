import { Box, Center, Icon, SegmentedControl } from "metabase/ui";

const args = {
  data: [
    {
      label: (
        <Center>
          <Icon name="embed" />
          <Box ml="0.5rem">Code</Box>
        </Center>
      ),
      value: "code",
    },
    {
      label: (
        <Center>
          <Icon name="eye_filled" />
          <Box ml="0.5rem">Preview</Box>
        </Center>
      ),
      value: "preview",
    },
  ],
  fullWidth: false,
};

const DefaultTemplate = args => <SegmentedControl {...args} />;
const Default = DefaultTemplate.bind({});
const FullWidth = DefaultTemplate.bind({});

export default {
  title: "Inputs/SegmentedControl",
  component: SegmentedControl,
  args: args,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const FullWidth_ = {
  render: FullWidth,
  name: "Full width",
  args: {
    data: [
      {
        label: "Light",
        value: "light",
      },
      {
        label: "Dark",
        value: "dark",
      },
      {
        label: "Transparent",
        value: "transparent",
      },
    ],
    fullWidth: true,
  },
};
