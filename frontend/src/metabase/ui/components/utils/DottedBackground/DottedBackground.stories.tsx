import {
  Card,
  DottedBackground,
  type DottedBackgroundProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";

const args: DottedBackgroundProps = {
  dotColor: "var(--mb-color-brand)",
  dotOpacity: 0.2,
  dotSpacing: "1rem",
  dotSize: "1px",
};

const argTypes = {
  dotColor: {
    control: { type: "text" },
    description:
      "The color for the dots. Can be a CSS variable or color value.",
  },
  dotOpacity: {
    control: { type: "range", min: 0, max: 1, step: 0.1 },
    description: "The opacity of the dots (0-1).",
  },
  dotSpacing: {
    control: { type: "text" },
    description: "The spacing between dots.",
  },
  dotSize: {
    control: { type: "text" },
    description: "The size of each dot.",
  },
};

export default {
  title: "Components/Utils/DottedBackground",
  component: DottedBackground,
  args,
  argTypes,
};

export const Default = {
  render: (args: DottedBackgroundProps) => (
    <DottedBackground {...args} p="xl" h={300}>
      <Card shadow="md" p="xl" withBorder>
        <Stack gap="md">
          <Title order={3}>Content with Dotted Background</Title>
          <Text>
            This card is displayed on top of a dotted background pattern. The
            pattern is created using CSS radial gradients and supports CSS
            variables for theming.
          </Text>
        </Stack>
      </Card>
    </DottedBackground>
  ),
};

export const CustomColors = {
  render: () => (
    <Stack gap="lg">
      <DottedBackground
        dotColor="var(--mb-color-saturated-blue)"
        dotOpacity={0.3}
        p="xl"
        h={200}
      >
        <Card shadow="md" p="xl" withBorder>
          <Text>Blue dots with higher opacity</Text>
        </Card>
      </DottedBackground>
      <DottedBackground
        dotColor="var(--mb-color-saturated-green)"
        dotOpacity={0.15}
        dotSpacing="1.5rem"
        p="xl"
        h={200}
      >
        <Card shadow="md" p="xl" withBorder>
          <Text>Green dots with larger spacing</Text>
        </Card>
      </DottedBackground>
      <DottedBackground
        dotColor="var(--mb-color-text-secondary)"
        dotOpacity={0.1}
        dotSpacing="0.75rem"
        dotSize="2px"
        p="xl"
        h={200}
      >
        <Card shadow="md" p="xl" withBorder>
          <Text>Larger dots with tighter spacing</Text>
        </Card>
      </DottedBackground>
    </Stack>
  ),
  name: "Custom Colors and Sizes",
};

export const FullPage = {
  render: () => (
    <DottedBackground p="xl" h="100vh">
      <Card shadow="md" p="xl" maw={600} mx="auto" withBorder>
        <Stack gap="md">
          <Title order={2}>Full Page Example</Title>
          <Text>
            The dotted background can be used as a full-page decorative element.
            It works well for upsell pages, empty states, or other marketing
            content.
          </Text>
        </Stack>
      </Card>
    </DottedBackground>
  ),
};
