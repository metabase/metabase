import type { StoryFn } from "@storybook/react";
import type { ReactNode } from "react";

import { Alert, type AlertProps, Box, Icon, Stack, Text } from "metabase/ui";
import { deriveFullMetabaseTheme } from "metabase/ui/colors";
import { StoryJsx, StoryShowcase } from "metabase/ui/stories/showcase";

const MESSAGE =
  "Let your team and customers chat with your data, query in natural language, and explore with AI-backed tools. Connect to your database in minutes for analytics without bottlenecks.";

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
    options: ["default", "core-brand", "warning", "error", "success"],
    control: { type: "select" },
  },
  withTitle: {
    control: { type: "boolean" },
    table: { category: "title" },
  },
  title: {
    control: { type: "text" },
    table: { category: "title" },
  },
  children: {
    control: { type: "text" },
  },
  withCloseButton: {
    control: { type: "boolean" },
  },
  withIcon: {
    control: { type: "boolean" },
  },
};

type StoryArgs = AlertProps & { withTitle?: boolean; withIcon?: boolean };

export default {
  title: "Components/Feedback/Alert",
  component: Alert,
  args: {
    variant: "default",
    size: "default",
    color: "default",
    title: "Open source analytics that answers back",
    children: MESSAGE,
    withCloseButton: false,
    withTitle: true,
    withIcon: true,
  },
  argTypes,
};

const DefaultTemplate: StoryFn<StoryArgs> = ({
  withTitle,
  withIcon,
  title,
  ...args
}) => (
  <Box w="480px">
    <Alert
      icon={withIcon ? <Icon name="model" /> : undefined}
      title={withTitle ? title : undefined}
      {...args}
    />
  </Box>
);

export const Default = {
  render: DefaultTemplate,
};

const OVERVIEW_CELLS = [
  {
    variant: "light",
    size: "default",
    withCloseButton: false,
    jsx: '<Alert variant="light" />',
  },
  {
    variant: "light",
    size: "default",
    withCloseButton: true,
    jsx: '<Alert variant="light" withCloseButton />',
  },
  {
    variant: "default",
    size: "default",
    withCloseButton: false,
    jsx: '<Alert variant="default" />',
  },
  {
    variant: "default",
    size: "default",
    withCloseButton: true,
    jsx: '<Alert variant="default" withCloseButton />',
  },
  {
    variant: "light",
    size: "compact",
    withCloseButton: false,
    jsx: '<Alert size="compact" variant="light" />',
  },
  {
    variant: "light",
    size: "compact",
    withCloseButton: true,
    jsx: '<Alert size="compact" variant="light" withCloseButton />',
  },
  {
    variant: "default",
    size: "compact",
    withCloseButton: false,
    jsx: '<Alert size="compact" variant="default" />',
  },
  {
    variant: "default",
    size: "compact",
    withCloseButton: true,
    jsx: '<Alert size="compact" variant="default" withCloseButton />',
  },
] as const;

const Overview: StoryFn<StoryArgs> = ({
  withTitle,
  withIcon,
  title,
  children,
}) => (
  <StoryShowcase title="Alert">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 480px)",
        gap: "48px",
        alignItems: "start",
      }}
    >
      {OVERVIEW_CELLS.map(({ variant, size, withCloseButton, jsx }) => (
        <Stack key={jsx} gap="sm">
          <StoryJsx>{jsx}</StoryJsx>
          <Alert
            variant={variant}
            size={size}
            withCloseButton={withCloseButton}
            icon={withIcon ? <Icon name="model" /> : undefined}
            title={withTitle ? title : undefined}
          >
            {children}
          </Alert>
        </Stack>
      ))}
    </Box>
  </StoryShowcase>
);

export const OverviewStory = {
  render: Overview,
  parameters: {
    controls: {
      include: ["theme", "withTitle", "withIcon", "title", "children"],
    },
  },
};

const FEEDBACK_COLORS = [
  { color: undefined, variant: "light", title: "Default alert" },
  { color: "error", variant: "default", title: "Error alert" },
  { color: "warning", variant: "default", title: "Warning alert" },
  { color: "success", variant: "default", title: "Positive alert" },
  { color: "core-brand", variant: "default", title: "Brand alert" },
] as const;

const FEEDBACK_SIZES = ["default", "compact"] as const;

const buildAlertJsx = ({
  variant,
  size,
  color,
}: {
  variant: AlertProps["variant"];
  size: AlertProps["size"];
  color?: AlertProps["color"];
}) =>
  `<Alert ${[
    `variant="${variant}"`,
    `size="${size}"`,
    color !== undefined && `color="${color}"`,
    "withCloseButton",
  ]
    .filter(Boolean)
    .join(" ")} />`;

const THEMES = ["light", "dark"] as const;

const getThemeVars = (
  colorScheme: (typeof THEMES)[number],
): Record<`--${string}`, string> => {
  const { colors } = deriveFullMetabaseTheme({ colorScheme });
  return Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [
      `--mb-color-${name}`,
      value,
    ]),
  );
};

const FeedbackColumn = ({
  colorScheme,
  withTitle,
  withIcon,
  titleOverride,
  message,
}: {
  colorScheme: (typeof THEMES)[number];
  withTitle?: boolean;
  withIcon?: boolean;
  titleOverride?: ReactNode;
  message?: ReactNode;
}) => (
  <Stack
    gap="48px"
    data-mantine-color-scheme={colorScheme}
    style={{
      ...getThemeVars(colorScheme),
      padding: "48px 96px 96px",
      backgroundColor: "var(--mb-color-background-primary)",
    }}
  >
    {FEEDBACK_COLORS.flatMap(({ color, variant, title }) =>
      FEEDBACK_SIZES.map((size) => (
        <Stack key={`${color ?? "default"}-${size}`} gap="sm" w="480px">
          <StoryJsx>{buildAlertJsx({ variant, size, color })}</StoryJsx>
          <Alert
            variant={variant}
            size={size}
            color={color}
            withCloseButton
            icon={withIcon ? <Icon name="model" /> : undefined}
            title={withTitle ? titleOverride || title : undefined}
          >
            {message ?? MESSAGE}
          </Alert>
        </Stack>
      )),
    )}
  </Stack>
);

const FeedbackTemplate: StoryFn<StoryArgs> = ({
  withTitle,
  withIcon,
  title,
  children,
}) => (
  <Box
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "auto 1fr",
      minHeight: "100vh",
    }}
  >
    <Box
      style={{
        ...getThemeVars("light"),
        padding: "96px 96px 0",
        backgroundColor: "var(--mb-color-background-primary)",
      }}
    >
      <Text fz="1.5rem" fw="bold" c="text-primary">
        Feedback
      </Text>
    </Box>
    <Box
      style={{
        ...getThemeVars("dark"),
        backgroundColor: "var(--mb-color-background-primary)",
      }}
    />
    {THEMES.map((colorScheme) => (
      <FeedbackColumn
        key={colorScheme}
        colorScheme={colorScheme}
        withTitle={withTitle}
        withIcon={withIcon}
        titleOverride={title}
        message={children}
      />
    ))}
  </Box>
);

export const Feedback = {
  render: FeedbackTemplate,
  args: {
    title: "",
  },
  parameters: {
    controls: {
      include: ["withTitle", "withIcon", "title", "children"],
    },
    backgrounds: { disable: true },
    viewport: { disable: true },
    measure: { disable: true },
    outline: { disable: true },
  },
};
