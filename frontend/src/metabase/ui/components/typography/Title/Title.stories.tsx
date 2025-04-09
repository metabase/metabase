import { Group, Stack, Title, type TitleProps } from "metabase/ui";

const args = {
  align: "left",
  order: 1,
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
};

const DefaultTemplate = (args: TitleProps) => <Title {...args}>Header</Title>;

const SizeTemplate = (args: TitleProps) => (
  <Group align="top">
    <Stack>
      <Title {...args} order={1}>
        Get up and running in no time
      </Title>
      <Title {...args} order={2}>
        Get up and running in no time
      </Title>
      <Title {...args} order={3}>
        Get up and running in no time
      </Title>
      <Title {...args} order={4}>
        Get up and running in no time
      </Title>
      <Title {...args} order={5}>
        Get up and running in no time
      </Title>
    </Stack>
    <Stack maw={400}>
      <Title {...args} order={1}>
        Segment access and unlock multi-tenant analytics via row-level data
        sandboxes
      </Title>
      <Title {...args} order={2}>
        Segment access and unlock multi-tenant analytics via row-level data
        sandboxes
      </Title>
      <Title {...args} order={3}>
        Segment access and unlock multi-tenant analytics via row-level data
        sandboxes
      </Title>
      <Title {...args} order={4}>
        Segment access and unlock multi-tenant analytics via row-level data
        sandboxes
      </Title>
      <Title {...args} order={5}>
        Segment access and unlock multi-tenant analytics via row-level data
        sandboxes
      </Title>
    </Stack>
  </Group>
);

export default {
  title: "Design System/Typography/Title",
  component: Title,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Sizes = {
  render: SizeTemplate,
};
