import { Badge, type BadgeProps, Grid, Text } from "metabase/ui";

const args = {
  variant: "light",
  size: "sm",
  children: "1",
};

const argTypes = {
  variant: {
    options: ["light", "filled-brand", "filled-error"],
    control: { type: "inline-radio" },
  },
  size: {
    options: ["xs", "sm"],
    control: { type: "inline-radio" },
  },
  children: {
    control: { type: "text" },
  },
};

const DefaultTemplate = ({ children, size, variant }: BadgeProps) => {
  if (variant === "light") {
    return (
      <Badge size={size} variant="light">
        {children}
      </Badge>
    );
  }

  if (variant === "filled-brand") {
    return (
      <Badge bg="brand" size={size} variant="filled">
        {children}
      </Badge>
    );
  }

  if (variant === "filled-error") {
    return (
      <Badge bg="error" size={size} variant="filled">
        {children}
      </Badge>
    );
  }
};

const GridTemplate = ({ children }: BadgeProps) => (
  <Grid align="center" bg="background-primary" columns={3} p="xl" w="50rem">
    <Grid.Col span={1} />

    {argTypes.size.options.map((size) => (
      <Grid.Col span={1} key={size}>
        <Text fw="bold">{size}</Text>
      </Grid.Col>
    ))}

    <Grid.Col span={1}>
      <Text fw="bold">light</Text>
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge size="xs" variant="light">
        {children}
      </Badge>
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge size="sm" variant="light">
        {children}
      </Badge>
    </Grid.Col>

    <Grid.Col span={1}>
      <Text fw="bold">filled / brand</Text>
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge bg="brand" size="xs" variant="filled">
        {children}
      </Badge>
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge bg="brand" size="sm" variant="filled">
        {children}
      </Badge>
    </Grid.Col>

    <Grid.Col span={1}>
      <Text fw="bold">filled / error</Text>
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge bg="error" size="xs" variant="filled">
        {children}
      </Badge>
    </Grid.Col>

    <Grid.Col span={1}>
      <Badge bg="error" size="sm" variant="filled">
        {children}
      </Badge>
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
      exclude: ["variant", "size"],
    },
  },
};
