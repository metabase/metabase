import type { StoryFn } from "@storybook/react";

import { Box, Button, Flex, Tooltip, type TooltipProps } from "metabase/ui";
import { StoryJsx, StoryShowcase } from "metabase/ui/stories/showcase";

const POSITIONS = ["top", "bottom", "left", "right"] as const;

const args = {
  label: "Tooltip",
  position: "bottom",
};

const argTypes = {
  label: {
    control: { type: "text" },
  },
  position: {
    options: [
      "bottom",
      "left",
      "right",
      "top",
      "bottom-end",
      "bottom-start",
      "left-end",
      "left-start",
      "right-end",
      "right-start",
      "top-end",
      "top-start",
    ],
    control: { type: "select" },
  },
  color: {
    control: { type: "text" },
  },
};

const DefaultTemplate = (args: TooltipProps) => (
  <Flex justify="center" mih="200px">
    <Tooltip {...args}>
      <Button variant="filled">Toggle tooltip</Button>
    </Tooltip>
  </Flex>
);

const OverviewTemplate: StoryFn<TooltipProps> = ({ label }) => (
  <StoryShowcase title="Tooltip">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${POSITIONS.length}, max-content)`,
        columnGap: "2rem",
        rowGap: "1rem",
      }}
    >
      {POSITIONS.map((position) => (
        <StoryJsx key={position}>
          {`<Tooltip position="${position}" />`}
        </StoryJsx>
      ))}
      {POSITIONS.map((position) => (
        <Flex key={position} align="center" justify="center" w={140} h={100}>
          <Tooltip
            label={label}
            opened
            position={position}
            withinPortal={false}
          >
            <Button variant="filled">Target</Button>
          </Tooltip>
        </Flex>
      ))}
    </Box>
  </StoryShowcase>
);

export default {
  title: "Components/Overlays/Tooltip",
  component: Tooltip,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  parameters: { loki: { skip: true } },
};

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    controls: { include: ["label", "theme"] },
  },
};

export const LongContentWithFixedWidth = {
  render: DefaultTemplate,
  args: {
    opened: true,
    label: (
      <div style={{ maxWidth: 350 }}>
        The query for this chart was run in America/Toronto rather than UTC due
        to database or driver constraints.
      </div>
    ),
  },
};
