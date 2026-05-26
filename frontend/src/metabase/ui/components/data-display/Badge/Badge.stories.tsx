import { Badge, type BadgeProps, Grid, Text } from "metabase/ui";

const args = {
  variant: "light",
  size: "sm",
  color: "default",
  children: "1",
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
  bg: {
    options: [undefined, "brand" as const, "background-error" as const],
    control: { type: "inline-radio" },
  },
  color: {
    options: [undefined, "brand" as const, "error" as const],
    control: { type: "inline-radio" },
  },
  children: {
    control: { type: "text" },
  },
};

const DefaultTemplate = (props: BadgeProps) => <Badge {...props} />;

const GridTemplate = (props: BadgeProps) => (
  <Grid align="center" bg="background-primary" columns={4} p="xl" w="50rem">
    <Grid.Col span={2} />

    {argTypes.size.options.map((size) => (
      <Grid.Col span={1} key={size}>
        <Text fw="bold">{size}</Text>
      </Grid.Col>
    ))}

    <Grid.Col span={2}>
      <Text fw="bold">light</Text>
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge {...props} variant="light" size="xs" />
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge {...props} variant="light" size="sm" />
    </Grid.Col>

    <Grid.Col span={2}>
      <Text fw="bold">filled / brand</Text>
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge {...props} bg="brand" color="white" variant="filled" size="xs" />
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge {...props} bg="brand" color="white" variant="filled" size="sm" />
    </Grid.Col>

    <Grid.Col span={2}>
      <Text fw="bold">filled / error</Text>
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge {...props} bg="error" color="white" variant="filled" size="xs" />
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge {...props} bg="error" color="white" variant="filled" size="sm" />
    </Grid.Col>
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
      exclude: ["variant", "size", "color", "bg"],
    },
  },
};
