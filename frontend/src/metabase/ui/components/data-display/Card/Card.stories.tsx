/* eslint-disable react/prop-types */
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
      <Stack spacing="sm">
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
        <Box bg="bg" h="10rem" />
      </Card.Section>
      <Stack mt="md" spacing="sm">
        <Text fw="bold">{sampleArgs.title}</Text>
        <Text>{sampleArgs.description}</Text>
      </Stack>
    </Card>
  </Box>
);

const CardSectionBorderTemplate = (
  args: CardProps & { withSectionBorder: boolean },
) => <CardSectionTemplate {...args} withSectionBorder />;

const Default = DefaultTemplate.bind({});
const Border = DefaultTemplate.bind({});
const CardSection = CardSectionTemplate.bind({});
const CardSectionBorder = CardSectionBorderTemplate.bind({});

export default {
  title: "Data display/Card",
  component: Card,
  args,
  argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const Border_ = {
  render: Border,
  name: "Border",
  args: {
    withBorder: true,
  },
};

export const CardSection_ = {
  render: CardSection,
  name: "Card section",
};

export const CardSectionBorder_ = {
  render: CardSectionBorder,
  name: "Card section, border",
};
