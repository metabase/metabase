import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Accordion, type AccordionProps, Box, Icon, Text } from "metabase/ui";
import { StoryJsx, StoryShowcase } from "metabase/ui/stories/showcase";

import S from "./Accordion.module.css";

const PANEL_TEXT =
  "Accordion allows users to expand and collapse sections of content. It helps manage large amounts of information in a limited space by showing only the section headers initially and revealing content on interaction.";

const ITEM_VALUES = ["first", "second", "third"] as const;

const args = {
  chevronPosition: "right",
};

const argTypes = {
  chevronPosition: {
    options: ["right", "left"],
    control: { type: "inline-radio" },
  },
};

export default {
  title: "Components/Data display/Accordion",
  component: Accordion,
  args,
  argTypes,
};

const Template: StoryFn<AccordionProps> = (args) => (
  <Box w={320}>
    <Accordion variant="separated" defaultValue="first" {...args}>
      {ITEM_VALUES.map((value) => (
        <Accordion.Item key={value} value={value}>
          <Accordion.Control icon={<Icon name="model" />}>
            Label
          </Accordion.Control>
          <Accordion.Panel>{PANEL_TEXT}</Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  </Box>
);

export const Default = {
  render: Template,
};

const COLUMNS = [
  { id: "right", chevronPosition: "right", withIcon: false },
  { id: "right-icon", chevronPosition: "right", withIcon: true },
  { id: "left", chevronPosition: "left", withIcon: false },
] as const;

const COLUMN_JSX: Record<(typeof COLUMNS)[number]["id"], string> = {
  right: `<Accordion variant="separated" chevronPosition="right" />`,
  "right-icon": `<Accordion.Control icon={<Icon />} />`,
  left: `<Accordion variant="separated" chevronPosition="left" />`,
};

const STATES = [
  { id: "closed", label: "Closed" },
  { id: "closed-hover", label: "Closed, hover" },
  { id: "closed-pressed", label: "Closed, pressed" },
  { id: "open", label: "Open", open: true },
  { id: "open-hover", label: "Open, hover", open: true },
  { id: "open-pressed", label: "Open, pressed", open: true },
  { id: "disabled", label: "Disabled", disabled: true },
] satisfies {
  id: string;
  label: string;
  open?: boolean;
  disabled?: boolean;
}[];

// Hover and pressed live on the control button, not on the item, so the
// pseudo-state selector reaches through the row hook to the control slot.
const controlSelector = (id: string) =>
  `[data-state-row="${id}"] .${S.control}`;

const OverviewTemplate: StoryFn<AccordionProps> = () => (
  <StoryShowcase title="Accordion">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `9rem repeat(${COLUMNS.length}, 320px)`,
        columnGap: "2rem",
        rowGap: "0.5rem",
        alignItems: "center",
      }}
    >
      <div />
      {COLUMNS.map((column) => (
        <StoryJsx key={column.id}>{COLUMN_JSX[column.id]}</StoryJsx>
      ))}
      {STATES.map((state) => (
        <Fragment key={state.id}>
          <Text size="sm" c="text-secondary">
            {state.label}
          </Text>
          {COLUMNS.map((column) => (
            <Accordion
              key={`${state.id}-${column.id}`}
              variant="separated"
              chevronPosition={column.chevronPosition}
              defaultValue={state.open ? "item" : null}
            >
              <Accordion.Item value="item" data-state-row={state.id}>
                <Accordion.Control
                  icon={column.withIcon ? <Icon name="model" /> : undefined}
                  disabled={state.disabled}
                >
                  Label
                </Accordion.Control>
                <Accordion.Panel>{PANEL_TEXT}</Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          ))}
        </Fragment>
      ))}
    </Box>
  </StoryShowcase>
);

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      hover: ["closed-hover", "open-hover"].map(controlSelector),
      active: ["closed-pressed", "open-pressed"].map(controlSelector),
    },
    controls: { include: ["theme"] },
  },
};
