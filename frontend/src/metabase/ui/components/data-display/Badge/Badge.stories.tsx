import { Fragment } from "react";

import { Badge, type BadgeProps, Grid, Text } from "metabase/ui";

const args = {
  variant: "light",
  size: "sm",
  color: "default",
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
  color: {
    options: [undefined, "brand" as const, "background-error" as const],
    control: { type: "inline-radio" },
  },
};

const DefaultTemplate = (props: BadgeProps) => <Badge {...props}>Badge</Badge>;

const GridTemplate = (props: BadgeProps) => (
  <Grid w="30rem" columns={4} align="center">
    <Grid.Col span={2} />

    {argTypes.size.options.map((size) => (
      <Grid.Col span={1} key={size}>
        <Text fw="bold">{size}</Text>
      </Grid.Col>
    ))}

    {argTypes.variant.options.map((variant) => {
      return argTypes.color.options.map((color) => (
        <Fragment key={`${variant}-${color}`}>
          <Grid.Col span={2}>
            <Text fw="bold">
              {variant} / {color ?? "default"}
            </Text>
          </Grid.Col>

          {argTypes.size.options.map((size) => (
            <Grid.Col span={1} key={size}>
              <Badge {...props} variant={variant} size={size} color={color}>
                1
              </Badge>
            </Grid.Col>
          ))}
        </Fragment>
      ));
    })}
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
      exclude: ["variant", "size", "color"],
    },
  },
};
