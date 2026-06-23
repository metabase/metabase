import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Box, Chip, type ChipProps, Group, Text } from "metabase/ui";
import { StoryJsx, StoryShowcase } from "metabase/ui/stories/showcase";

import S from "./Chip.module.css";

const LABEL = "Label";

const args = {
  size: "md",
  children: LABEL,
  disabled: false,
};

const argTypes = {
  size: {
    options: ["sm", "md"],
    control: { type: "inline-radio" },
  },
  children: {
    control: { type: "text" },
  },
  disabled: {
    control: { type: "boolean" },
  },
};

const VARIANTS = ["light", "filled"] as const;

const SIZES = ["sm", "md"] as const;

const COLUMNS: {
  variant: (typeof VARIANTS)[number];
  size: (typeof SIZES)[number];
}[] = VARIANTS.flatMap((variant) => SIZES.map((size) => ({ variant, size })));

// The interactive states from the Figma spec. `Hover` and `Pressed` rows have
// their state forced by `storybook-addon-pseudo-states` (see
// `parameters.pseudo` on the `Overview` story below) so the matrix renders them
// without real pointer interaction.
type ChipState = {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
};

const STATES: ChipState[] = [
  { id: "default", label: "Default" },
  { id: "hover", label: "Hover" },
  { id: "pressed", label: "Pressed" },
  { id: "selected", label: "Selected", checked: true },
  { id: "hover-selected", label: "Hover selected", checked: true },
  { id: "disabled", label: "Disabled", disabled: true },
  {
    id: "disabled-selected",
    label: "Disabled selected",
    checked: true,
    disabled: true,
  },
];

// Per-row selectors for the pseudo-states addon. The addon rewrites every
// `:hover` rule to also match `<rule>.pseudo-hover`, so the selector must
// target the exact element the rule attaches to — the `.ChipLabel` slot, not
// the root. We tag each chip with `data-state-row` so we can target a single
// row's labels (one per column).
const chipLabelSelectorFor = (id: string) =>
  `[data-state-row="${id}"] .${S.ChipLabel}`;

const PSEUDO_STATE_PARAMETERS = {
  pseudo: {
    hover: ["hover", "hover-selected"].map(chipLabelSelectorFor),
    active: ["pressed"].map(chipLabelSelectorFor),
  },
};

const OverviewTemplate: StoryFn<ChipProps> = ({ children }) => (
  <StoryShowcase title="Chip">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `9rem repeat(${COLUMNS.length}, max-content)`,
        columnGap: "2rem",
        rowGap: "1rem",
        alignItems: "center",
        justifyItems: "start",
      }}
    >
      <div />
      {COLUMNS.map(({ variant, size }) => (
        <StoryJsx
          key={`${variant}-${size}`}
        >{`<Chip variant="${variant}" size="${size}" />`}</StoryJsx>
      ))}

      {STATES.map((state) => (
        <Fragment key={state.id}>
          <Text size="sm" c="text-secondary">
            {state.label}
          </Text>
          {COLUMNS.map(({ variant, size }) => (
            <Chip
              key={`${variant}-${size}`}
              // Mantine forwards top-level `data-*` to the hidden `<input>`,
              // so we use `wrapperProps` to land it on the chip root where
              // the pseudo-states selector can reach `.ChipLabel`.
              wrapperProps={{ "data-state-row": state.id }}
              variant={variant}
              size={size}
              checked={state.checked ?? false}
              disabled={state.disabled ?? false}
              onChange={() => {}}
            >
              {children}
            </Chip>
          ))}
        </Fragment>
      ))}
    </Box>
  </StoryShowcase>
);

const DefaultTemplate: StoryFn<ChipProps> = (args) => (
  <Group>
    <Chip {...args} defaultChecked />
  </Group>
);

export default {
  title: "Components/Ask Before Using/Chip",
  component: Chip,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    ...PSEUDO_STATE_PARAMETERS,
    controls: { include: ["children", "theme"] },
  },
};
