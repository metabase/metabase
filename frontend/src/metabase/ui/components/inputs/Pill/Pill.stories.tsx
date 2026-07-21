import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Box, Pill, type PillProps, Text } from "metabase/ui";
import { StoryJsx, StoryShowcase } from "metabase/ui/stories/showcase";

const argTypes = {
  children: { control: { type: "text" } },
  size: { control: { type: "inline-radio" }, options: ["sm", "md"] },
  withRemoveButton: { control: { type: "boolean" } },
  disabled: { control: { type: "boolean" } },
};

export default {
  title: "Components/Inputs/Pill",
  component: Pill,
  args: {
    children: "Pill",
  },
  argTypes,
};

const Template: StoryFn<PillProps> = (args) => <Pill {...args} />;

export const Default = {
  render: Template,
};

const COLUMNS = [
  { size: "sm", withRemoveButton: false, jsx: '<Pill size="sm" />' },
  {
    size: "sm",
    withRemoveButton: true,
    jsx: '<Pill size="sm" withRemoveButton />',
  },
  { size: "md", withRemoveButton: false, jsx: '<Pill size="md" />' },
  {
    size: "md",
    withRemoveButton: true,
    jsx: '<Pill size="md" withRemoveButton />',
  },
] as const;

const STATES = [
  { id: "default", label: "Default" },
  { id: "hover", label: "Hover" },
  { id: "disabled", label: "Disabled", disabled: true },
];

const Overview: StoryFn<PillProps> = ({ children }) => (
  <StoryShowcase title="Pill">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `7rem repeat(${COLUMNS.length}, max-content)`,
        columnGap: "2rem",
        rowGap: "1rem",
        alignItems: "center",
      }}
    >
      <div />
      {COLUMNS.map(({ jsx }) => (
        <StoryJsx key={jsx}>{jsx}</StoryJsx>
      ))}
      {STATES.map((state) => (
        <Fragment key={state.id}>
          <Text size="sm" c="text-secondary">
            {state.label}
          </Text>
          {COLUMNS.map(({ size, withRemoveButton }) => (
            <Box
              key={`${size}-${String(withRemoveButton)}`}
              style={{ width: "max-content" }}
            >
              <Pill
                data-state-row={state.id}
                size={size}
                withRemoveButton={withRemoveButton}
                disabled={state.disabled ?? false}
                onRemove={() => {}}
              >
                {children}
              </Pill>
            </Box>
          ))}
        </Fragment>
      ))}
    </Box>
  </StoryShowcase>
);

export const OverviewStory = {
  render: Overview,
  parameters: {
    pseudo: { hover: '[data-state-row="hover"]' },
    controls: { include: ["children", "theme"] },
  },
};
