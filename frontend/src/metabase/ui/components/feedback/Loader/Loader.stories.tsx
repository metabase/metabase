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

const SizeTemplate = () => (
  <Grid w="10rem" columns={2} align="center">
    {argTypes.size.options.map(size => (
      <Fragment key={size}>
        <Grid.Col span={1}>
          <Text fw="bold">{size}</Text>
        </Grid.Col>
        <Grid.Col span={1}>
          <Loader size={size} />
        </Grid.Col>
      </Fragment>
    ))}
  </Grid>
);

export default {
  title: "Feedback/Loader",
  component: Loader,
  args,
  argTypes,
};

export const Default = {};

export const Sizes = {
  render: SizeTemplate,
};
