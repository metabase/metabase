import { Box, Card, type CardProps, Stack, Text } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";

const theme = getThemeOverrides();

const spacingOptions = Object.keys(theme.spacing ?? {});
const radiusOptions = Object.keys(theme.radius ?? {});
const shadowOptions = Object.keys(theme.shadows ?? {});

const args = {
  p: "lg",
  radius: "sm",
  shadow: "xs",
  withBorder: false,
};

const sampleArgs = {
  title: "Peace",
  description:
    "The elm tree planted by Eleanor Bold, the judge’s daughter, fell last night.",
};

const argTypes = {
  p: {
    options: spacingOptions,
    control: { type: "inline-radio" },
  },
  radius: {
    options: radiusOptions,
    control: { type: "inline-radio" },
  },
  shadow: {
    options: shadowOptions,
    control: { type: "inline-radio" },
  },
  withBorder: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = (args: CardProps) => (
  <Box maw="20rem">
    <Card {...args}>
      <Stack gap="sm">
        <Text fw="bold">{sampleArgs.title}</Text>
        <Text>{sampleArgs.description}</Text>
      </Stack>
    </Card>
  </Box>
);

const ShadowMatrixTemplate = (args: CardProps) => (
  <Stack gap="xxl" maw="24rem">
    {shadowOptions.map((shadow) => (
      <Card key={shadow} {...args} p="xl" shadow={shadow}>
        <Text fw="bold">Shadow {shadow}</Text>
      </Card>
    ))}
  </Stack>
);

const CardSectionTemplate = ({
  withSectionBorder,
  ...args
}: CardProps & { withSectionBorder: boolean }) => (
  <Box maw="20rem">
    <Card {...args}>
      <Card.Section withBorder={withSectionBorder}>
        <Box bg="background_page-primary" h="10rem" />
      </Card.Section>
      <Stack mt="lg" gap="sm">
        <Text fw="bold">{sampleArgs.title}</Text>
        <Text>{sampleArgs.description}</Text>
      </Stack>
    </Card>
  </Box>
);

const CardSectionBorderTemplate = (
  args: CardProps & { withSectionBorder: boolean },
) => <CardSectionTemplate {...args} withSectionBorder />;

export default {
  title: "Components/Data display/Card",
  component: Card,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Border = {
  render: DefaultTemplate,
  args: {
    withBorder: true,
  },
};

export const ShadowMatrix = {
  render: ShadowMatrixTemplate,
  name: "Shadow matrix",
};

export const CardSection = {
  render: CardSectionTemplate,
  name: "Card section",
};

export const CardSectionBorder = {
  render: CardSectionBorderTemplate,
  name: "Card section, border",
};
