import { Box, Stack, Title, type TitleProps } from "metabase/ui";

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

const DefaultTemplate = (args: TitleProps) => <Title {...args}>Header</Title>;

const SizeTemplate = (args: TitleProps) => (
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

const TruncatedTemplate = (args: TitleProps) => (
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

export default {
  title: "Typography/Title",
  component: Title,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  name: "Default",
};

export const Sizes = {
  render: SizeTemplate,
  name: "Sizes",
};

export const Underlined = {
  render: SizeTemplate,
  name: "Underlined",
  args: {
    underline: true,
  },
};

export const Truncated = {
  render: TruncatedTemplate,
  name: "Truncated",
  args: {
    truncate: true,
  },
};

export const TruncatedAndUnderlined = {
  render: TruncatedTemplate,
  name: "Truncated and underlined",
  args: {
    truncate: true,
    underline: true,
  },
};
