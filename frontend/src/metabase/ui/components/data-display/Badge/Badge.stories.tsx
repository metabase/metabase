import { Fragment } from "react";

import { Badge, type BadgeProps, Grid, Text } from "metabase/ui";

const args = {
  variant: "light",
  size: "sm",
};

const argTypes = {
  variant: {
    options: ["light", "filled"],
    control: { type: "inline-radio" },
  },
  size: {
    options: ["xs", "sm"],
    control: { type: "inline-radio" },
  },
};

const DefaultTemplate = (args: BadgeProps) => <Badge {...args}>Badge</Badge>;

const GridTemplate = (args: BadgeProps) => (
  <Grid w="20rem" columns={3} align="center">
    <Grid.Col span={1} />
    {argTypes.size.options.map((size) => (
      <Grid.Col span={1} key={size}>
        <Text fw="bold">{size}</Text>
      </Grid.Col>
    ))}
    {argTypes.variant.options.map((variant) => (
      <Fragment key={variant}>
        <Grid.Col span={1}>
          <Text fw="bold">{variant}</Text>
        </Grid.Col>
        {argTypes.size.options.map((size) => (
          <Grid.Col span={1} key={size}>
            <Badge {...args} variant={variant} size={size}>
              Badge
            </Badge>
          </Grid.Col>
        ))}
      </Fragment>
    ))}
  </Grid>
);

export default {
  title: "Components/Data display/Badge",
  component: Badge,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const SizesAndVariants = {
  render: GridTemplate,
  name: "Sizes and variants",
  parameters: {
    controls: {
      exclude: ["variant", "size"],
    },
  },
};
