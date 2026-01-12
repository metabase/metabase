import { Box, Card, type CardProps, Stack, Text } from "metabase/ui";

const args = {
  p: "md",
  radius: "md",
  withBorder: false,
};

const sampleArgs = {
  title: "Peace",
  description:
    "The elm tree planted by Eleanor Bold, the judge’s daughter, fell last night.",
};

const argTypes = {
  p: {
    options: ["xs", "sm", "md", "lg", "xl"],
    control: { type: "inline-radio" },
  },
  radius: {
    options: ["xs", "sm", "md"],
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

const CardSectionTemplate = ({
  withSectionBorder,
  ...args
}: CardProps & { withSectionBorder: boolean }) => (
  <Box maw="20rem">
    <Card {...args}>
      <Card.Section withBorder={withSectionBorder}>
        <Box bg="background-primary" h="10rem" />
      </Card.Section>
      <Stack mt="md" gap="sm">
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

export const CardSection = {
  render: CardSectionTemplate,
  name: "Card section",
};

export const CardSectionBorder = {
  render: CardSectionBorderTemplate,
  name: "Card section, border",
};
