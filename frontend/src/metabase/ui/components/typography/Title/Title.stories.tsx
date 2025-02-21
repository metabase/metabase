import { Stack, Title, type TitleProps } from "metabase/ui";

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

export default {
  title: "Typography/Title",
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
