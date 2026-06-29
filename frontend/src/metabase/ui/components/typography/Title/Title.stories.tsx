import { Fragment } from "react";

import { Grid, Text, Title, type TitleProps } from "metabase/ui";

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
    options: [1, 2, 3, 4, 5, 6] satisfies (1 | 2 | 3 | 4 | 5 | 6)[],
    control: { type: "inline-radio" },
  },
};

const DefaultTemplate = (args: TitleProps) => <Title {...args}>Header</Title>;

const SizeTemplate = (args: TitleProps) => (
  <Grid align="center" maw="64rem">
    {argTypes.order.options.map((order) => (
      <Fragment key={order}>
        <Grid.Col span={1}>
          <Text fw="bold">{order}</Text>
        </Grid.Col>
        <Grid.Col span={5}>
          <Title {...args} order={order}>
            Get up and running in no time
          </Title>
        </Grid.Col>
        <Grid.Col span={6}>
          <Title {...args} order={order}>
            Segment access and unlock multi-tenant analytics via row-level data
            sandboxes
          </Title>
        </Grid.Col>
      </Fragment>
    ))}
  </Grid>
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
