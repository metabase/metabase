import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Alert, type AlertProps, Box, Icon, Stack, Text } from "metabase/ui";
import { StoryJsx, StoryShowcase } from "metabase/ui/stories/showcase";

const TITLE = "Open source analytics that answers back";
const MESSAGE =
  "Let your team and customers chat with your data, query in natural language, and explore with AI-backed tools. Connect to your database in minutes for analytics without bottlenecks.";

const args = {
  icon: <Icon name="info" />,
  title: TITLE,
  withCloseButton: false,
};

const argTypes = {
  variant: {
    options: ["default", "light"],
    control: { type: "inline-radio" },
  },
  size: {
    options: ["default", "compact"],
    control: { type: "inline-radio" },
  },
  color: {
    control: { type: "text" },
  },
  title: {
    control: { type: "text" },
  },
  withCloseButton: {
    control: { type: "toggle" },
  },
};

const DefaultTemplate = (args: AlertProps) => (
  <Alert {...args}>
    <Text>{MESSAGE}</Text>
  </Alert>
);

const COLUMNS = [
  { variant: "default", withCloseButton: false },
  { variant: "default", withCloseButton: true },
  { variant: "light", withCloseButton: false },
  { variant: "light", withCloseButton: true },
] as const;

const SIZES = [
  { size: "default", label: "Default" },
  { size: "compact", label: "Compact" },
] as const;

const COLORS = ["info", "core-brand", "warning", "error", "success"] as const;

const Overview: StoryFn<AlertProps> = () => (
  <StoryShowcase title="Alert">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `8rem repeat(${COLUMNS.length}, minmax(0, 1fr))`,
        columnGap: "1.5rem",
        rowGap: "1.5rem",
        alignItems: "start",
      }}
    >
      <div />
      {COLUMNS.map(({ variant, withCloseButton }) => (
        <StoryJsx
          key={`${variant}-${withCloseButton}`}
        >{`<Alert variant="${variant}"${withCloseButton ? " withCloseButton" : ""} />`}</StoryJsx>
      ))}
      {SIZES.map(({ size, label }) =>
        COLORS.map((color) => (
          <Fragment key={`${size}-${color}`}>
            <Text size="sm" c="text-secondary" mt="sm">
              {label} / {color}
            </Text>
            {COLUMNS.map(({ variant, withCloseButton }) => (
              <Alert
                key={`${variant}-${withCloseButton}`}
                variant={variant}
                size={size}
                color={color}
                withCloseButton={withCloseButton}
                icon={<Icon name="model" />}
                title={TITLE}
              >
                {MESSAGE}
              </Alert>
            ))}
          </Fragment>
        )),
      )}
    </Box>
  </StoryShowcase>
);

const ColorsTemplate = (args: AlertProps) => (
  <Stack>
    {(["info", "core-brand", "warning", "error", "success"] as const).map(
      (color) => (
        <Alert
          {...args}
          key={color}
          color={color}
          icon={<Icon name="info" />}
          title={`color="${color}"`}
        >
          <Text>{MESSAGE}</Text>
        </Alert>
      ),
    )}
  </Stack>
);

export default {
  title: "Components/Feedback/Alert",
  component: Alert,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const OverviewStory = {
  render: Overview,
  parameters: {
    controls: { include: [] },
  },
};

export const Colors = {
  render: ColorsTemplate,
};
