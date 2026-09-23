import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import {
  Box,
  Group,
  Icon,
  SegmentedControl,
  type SegmentedControlItem,
  type SegmentedControlProps,
  Text,
} from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

import S from "./SegmentedControl.module.css";

const TEXT_DATA = [
  { label: "Code", value: "code" },
  { label: "Preview", value: "preview" },
];

const TEXT_AND_ICON_DATA = [
  {
    label: (
      <Group gap="xs" wrap="nowrap">
        <Icon name="embed" />
        Code
      </Group>
    ),
    value: "code",
  },
  {
    label: (
      <Group gap="xs" wrap="nowrap">
        <Icon name="eye_filled" />
        Preview
      </Group>
    ),
    value: "preview",
  },
];

const ICON_DATA = [
  { label: <Icon name="embed" aria-label="Code" />, value: "code" },
  { label: <Icon name="eye_filled" aria-label="Preview" />, value: "preview" },
];

export default {
  title: "Components/Inputs/SegmentedControl",
  component: SegmentedControl,
};

export const TextOnly = {
  name: "Text only",
  args: { data: TEXT_DATA },
};

export const TextAndIcon = {
  name: "Text + icon",
  args: { data: TEXT_AND_ICON_DATA },
};

export const IconOnly = {
  name: "Icon only",
  args: { data: ICON_DATA },
};

export const FullWidth = {
  name: "Full width",
  args: { data: TEXT_AND_ICON_DATA, fullWidth: true },
};

export const Disabled = {
  name: "Disabled (text + icon)",
  args: { data: TEXT_AND_ICON_DATA, disabled: true },
};

const CONTENT_KINDS: {
  id: string;
  label: string;
  data: SegmentedControlItem<string>[];
}[] = [
  { id: "text", label: "Text only", data: TEXT_DATA },
  { id: "text-and-icon", label: "Text + icon", data: TEXT_AND_ICON_DATA },
  { id: "icon", label: "Icon only", data: ICON_DATA },
];

type OverviewState = {
  id: string;
  label: string;
  /** JSX shown in place of the label when the state comes from props. */
  jsx?: string;
  props?: Partial<SegmentedControlProps<string>>;
  disabledItem?: boolean;
};

const OVERVIEW_STATES: OverviewState[] = [
  { id: "default", label: "Default" },
  { id: "hover", label: "Hover" },
  { id: "pressed", label: "Pressed" },
  {
    id: "disabled",
    label: "Disabled",
    jsx: "<SegmentedControl disabled />",
    props: { disabled: true },
  },
  {
    id: "disabled-item",
    label: "Disabled item",
    jsx: '<SegmentedControl data={[…, { value: "preview", disabled: true }]} />',
    disabledItem: true,
  },
];

const withSecondItemDisabled = (data: SegmentedControlItem<string>[]) =>
  data.map((item, index) => (index === 1 ? { ...item, disabled: true } : item));

// The hover/pressed rules sit on the label slot, and exclude the active one,
// so targeting every label in the row forces the unselected segment only.
const labelSelectorFor = (id: string) =>
  `[data-state-row="${id}"] .${S.SegmentedControlLabel}`;

const gridStyle = {
  display: "grid",
  gridTemplateColumns: `14rem repeat(${CONTENT_KINDS.length}, max-content)`,
  columnGap: "2rem",
  rowGap: "1rem",
  alignItems: "center",
} as const;

const OverviewTemplate: StoryFn = () => (
  <StoryShowcase title="SegmentedControl">
    <StorySection title="States">
      <Box style={gridStyle}>
        <div />
        {CONTENT_KINDS.map(({ id, label }) => (
          <Text key={id} size="sm" c="text-secondary">
            {label}
          </Text>
        ))}
        {OVERVIEW_STATES.map((state) => (
          <Fragment key={state.id}>
            {state.jsx ? (
              <StoryJsx>{state.jsx}</StoryJsx>
            ) : (
              <Text size="sm" c="text-secondary">
                {state.label}
              </Text>
            )}
            {CONTENT_KINDS.map((kind) => (
              <Box key={kind.id}>
                <SegmentedControl
                  data-state-row={state.id}
                  data={
                    state.disabledItem
                      ? withSecondItemDisabled(kind.data)
                      : kind.data
                  }
                  defaultValue="code"
                  {...state.props}
                />
              </Box>
            ))}
          </Fragment>
        ))}
      </Box>
    </StorySection>

    <StorySection title="Full width">
      <Box w="24rem">
        <StoryJsx>{"<SegmentedControl fullWidth />"}</StoryJsx>
        <SegmentedControl
          mt="sm"
          data={TEXT_AND_ICON_DATA}
          defaultValue="code"
          fullWidth
        />
      </Box>
    </StorySection>
  </StoryShowcase>
);

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      hover: [labelSelectorFor("hover")],
      active: [labelSelectorFor("pressed")],
    },
    controls: { include: ["theme"] },
  },
};
