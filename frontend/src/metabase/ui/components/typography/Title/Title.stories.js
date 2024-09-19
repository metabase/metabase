import { Box, Stack, Title } from "metabase/ui";

const args = {
  align: "left",
  order: 1,
  underline: false,
  truncate: false,
};

const argTypes = {
  align: {
    options: ["left", "center", "right"],
    control: { type: "inline-radio" },
  },
  order: {
    options: [1, 2, 3, 4],
    control: { type: "inline-radio" },
  },
  underline: {
    control: { type: "boolean" },
  },
  truncate: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = args => <Title {...args}>Header</Title>;

const SizeTemplate = args => (
  <Stack>
    <Title {...args} order={1}>
      Header 1
    </Title>
    <Title {...args} order={2}>
      Header 2
    </Title>
    <Title {...args} order={3}>
      Header 3
    </Title>
    <Title {...args} order={4}>
      Header 4
    </Title>
  </Stack>
);

const TruncatedTemplate = args => (
  <Stack>
    <Box w="6rem">
      <Title {...args} order={1}>
        Header 1
      </Title>
    </Box>
    <Box w="5rem">
      <Title {...args} order={2}>
        Header 2
      </Title>
    </Box>
    <Box w="4rem">
      <Title {...args} order={3}>
        Header 3
      </Title>
    </Box>
    <Box w="3.5rem">
      <Title {...args} order={4}>
        Header 4
      </Title>
    </Box>
  </Stack>
);

const Default = DefaultTemplate.bind({});
const Sizes = SizeTemplate.bind({});
const Underlined = SizeTemplate.bind({});
const Truncated = TruncatedTemplate.bind({});
const TruncatedAndUnderlined = TruncatedTemplate.bind({});

export default {
  title: "Typography/Title",
  component: Title,
  args: args,
  argTypes: argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const Sizes_ = {
  render: Sizes,
  name: "Sizes",
};

export const Underlined_ = {
  render: Underlined,
  name: "Underlined",
  args: {
    underline: true,
  },
};

export const Truncated_ = {
  render: Truncated,
  name: "Truncated",
  args: {
    truncate: true,
  },
};

export const TruncatedAndUnderlined_ = {
  render: TruncatedAndUnderlined,
  name: "Truncated and underlined",
  args: {
    truncate: true,
    underline: true,
  },
};
