import { Fragment } from "react";

import { Grid, Text } from "metabase/ui";

import { Loader } from "./";

const args = {
  size: "md",
};

const argTypes = {
  size: {
    options: ["xs", "sm", "md", "lg", "xl"],
    control: { type: "inline-radio" },
  },
};

const DefaultTemplate = args => <Loader {...args} />;

const SizeTemplate = args => (
  <Grid w="10rem" columns={2} align="center">
    {argTypes.size.options.map(size => (
      <Fragment key={size}>
        <Grid.Col span={1} align="center">
          <Text weight="bold">{size}</Text>
        </Grid.Col>
        <Grid.Col span={1} align="center">
          <Loader size={size} />
        </Grid.Col>
      </Fragment>
    ))}
  </Grid>
);

const Default = DefaultTemplate.bind({});
const Sizes = SizeTemplate.bind({});

export default {
  title: "Feedback/Loader",
  component: Loader,
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
