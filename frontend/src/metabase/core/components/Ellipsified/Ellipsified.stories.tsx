// @ts-expect-error There is no type definition
import lokiScreenshotter from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
import { userEvent, within } from "@storybook/test";

import { Box, Paper, Stack, Text, type TextProps } from "metabase/ui";

import { Ellipsified, type EllipsifiedProps } from "./Ellipsified";

const testLabels = [
  "Short Title",
  "Long Title Wrapping to Next Line",
  "Very_________LongTitleWithNoSpaces",
  "Very Long Title With Spaces",
  "VeryLongTitleWithNoSpaces and more words",
  [1, 2, 3, 4, 5].map((i) => `${i}_VeryLongTitleWithNoSpaces`).join(" "),
];

export default {
  title: "Components/Text/Ellipsified",
  component: Ellipsified,
  parameters: {
    layout: "fullscreen",
  },
};

const EllipsifiedTexts = ({
  ellipsifiedProps,
  ...textProps
}: { ellipsifiedProps: EllipsifiedProps } & TextProps) => (
  <>
    {testLabels.map((label: string) => (
      <Box key={label} data-testid={`ellipsified-${label}`}>
        <Ellipsified
          {...ellipsifiedProps}
          data-testid={`ellipsified-text-${label}`}
        >
          <Text c="inherit" {...textProps} lh={1.2}>
            {label}
          </Text>
        </Ellipsified>
      </Box>
    ))}
  </>
);

const Template: StoryFn<typeof Ellipsified> = (ellipsifiedProps) => (
  <Stack maw="100px">
    <EllipsifiedTexts ellipsifiedProps={ellipsifiedProps} fz=".875em" />
    <EllipsifiedTexts ellipsifiedProps={ellipsifiedProps} fz="1em" />
  </Stack>
);

export const SingleLineEllipsify = {
  name: "Single-line",
  render: Template,
  args: { lines: 1 },
};

export const MultiLineClamp = {
  name: "Multi-line",
  render: Template,
  args: { lines: 8 },
};

const TooltipTestTemplate: StoryFn<typeof Ellipsified> = (ellipsifiedProps) => (
  <Paper h="20rem" w="20rem" p="3rem">
    <Stack maw="100px">
      <Box>
        <Ellipsified {...ellipsifiedProps} data-testid="short">
          <Text c="inherit" lh={1.2}>
            Short title
          </Text>
        </Ellipsified>
      </Box>
      <Box>
        <Ellipsified {...ellipsifiedProps} data-testid="long">
          <Text c="inherit" lh={1.2}>
            Long title that should get truncated
          </Text>
        </Ellipsified>
      </Box>
    </Stack>
  </Paper>
);

export const TooltipForLongText = {
  name: "Long text has a tooltip",
  render: TooltipTestTemplate,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const takeScreenshot = lokiScreenshotter();
    await userEvent.hover(within(canvasElement).getByTestId("long"));
    await within(document.body).findByRole("tooltip");
    takeScreenshot();
  },
};

export const NoTooltipForShortText = {
  name: "Short text has no tooltip",
  render: TooltipTestTemplate,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const takeScreenshot = lokiScreenshotter();
    await userEvent.hover(within(canvasElement).getByTestId("short"));
    // Wait to ensure that the tooltip is not shown
    await new Promise((resolve) => setTimeout(resolve, 500));
    takeScreenshot();
  },
};
