import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import {
  Box,
  Icon,
  SegmentedControl,
  type SegmentedControlItem,
  type SegmentedControlProps,
} from "metabase/ui";
import {
  StoryBoard,
  StoryJsx,
  StoryLabel,
  StorySection,
} from "metabase/ui/stories/showcase";

import S from "./SegmentedControl.module.css";

const TEXT_DATA = [
  { label: "Code", value: "code" },
  { label: "Preview", value: "preview" },
] satisfies SegmentedControlItem<string>[];

const TEXT_AND_ICON_DATA = [
  { label: "Code", icon: "embed", value: "code" },
  { label: "Preview", icon: "eye_filled", value: "preview" },
] satisfies SegmentedControlItem<string>[];

const ICON_DATA = [
  { ariaLabel: "Code", icon: "embed", value: "code" },
  { ariaLabel: "Preview", icon: "eye_filled", value: "preview" },
] satisfies SegmentedControlItem<string>[];

const ICON_ELEMENT_DATA = [
  { ariaLabel: "Code", icon: <Icon name="embed" />, value: "code" },
  { ariaLabel: "Preview", icon: <Icon name="eye_filled" />, value: "preview" },
] satisfies SegmentedControlItem<string>[];

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
  { id: "icon-element", label: "Icon element", data: ICON_ELEMENT_DATA },
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
  gridTemplateColumns: `9rem repeat(${CONTENT_KINDS.length}, max-content)`,
  columnGap: "1rem",
  rowGap: "1rem",
  alignItems: "center",
} as const;

const OverviewTemplate: StoryFn = () => (
  <StoryBoard title="SegmentedControl" padding="2rem">
    <StorySection title="States">
      <Box style={gridStyle}>
        <div />
        {CONTENT_KINDS.map(({ id, label }) => (
          <StoryLabel key={id}>{label}</StoryLabel>
        ))}
        {OVERVIEW_STATES.map((state) => (
          <Fragment key={state.id}>
            {state.jsx ? (
              <StoryJsx>{state.jsx}</StoryJsx>
            ) : (
              <StoryLabel>{state.label}</StoryLabel>
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
  </StoryBoard>
);

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      hover: [labelSelectorFor("hover")],
      active: [labelSelectorFor("pressed")],
    },
    controls: { disable: true },
  },
};
