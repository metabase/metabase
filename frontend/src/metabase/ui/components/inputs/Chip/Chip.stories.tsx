import type { StoryFn } from "@storybook/react";

import { Chip, type ChipProps, Group, Stack, Text } from "metabase/ui";
import {
  StoryCode,
  StoryJsx,
  StoryRow,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

const LABEL = "Label";

const args = {
  size: "md",
  children: LABEL,
  disabled: false,
};

const argTypes = {
  size: {
    // We only use the `sm` and `md` sizes (see GDGT-2483).
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

// The variants we support, rendered as the two columns of the showcase.
const VARIANTS = ["light", "filled"] as const;

// Sizes are shown in their own section; the default is `md`.
const SIZES = ["sm", "md"] as const;

// The interactive states from the Figma spec. `hover` and `pressed` are
// simulated with storybook-addon-pseudo-states, which forces the `:hover` /
// `:active` rules of any descendant under the `*-all` class.
type ChipState = {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  pseudo?: "hover" | "active";
};

const STATES: ChipState[] = [
  { label: "Default" },
  { label: "Hover", pseudo: "hover" },
  { label: "Pressed", pseudo: "active" },
  { label: "Selected", checked: true },
  { label: "Hover selected", checked: true, pseudo: "hover" },
  { label: "Disabled", disabled: true },
  { label: "Disabled selected", checked: true, disabled: true },
];

const PSEUDO_CLASS: Record<"hover" | "active", string> = {
  hover: "pseudo-hover-all",
  active: "pseudo-active-all",
};

// The showcase: a title, the sizes section, then a column per variant. Light and
// dark are driven by the global Storybook `theme` toggle.
const OverviewTemplate: StoryFn<ChipProps> = () => (
  <StoryShowcase title="Chip">
    <StorySection
      title="Sizes"
      description={
        <StoryCode c="text-secondary">{`Note: the default size is "md"`}</StoryCode>
      }
    >
      <Group gap="xl" mt="xs">
        {SIZES.map((size) => (
          <Stack key={size} gap="xs" align="center">
            <Chip size={size}>{LABEL}</Chip>
            <Text size="xs" c="text-secondary">
              {size}
            </Text>
          </Stack>
        ))}
      </Group>
    </StorySection>

    <Group align="flex-start" gap="4rem" wrap="nowrap">
      {VARIANTS.map((variant) => (
        <Stack key={variant} gap="lg">
          <StoryJsx>{`<Chip variant="${variant}" />`}</StoryJsx>
          <Stack gap="md">
            {STATES.map((state) => (
              <StoryRow key={state.label} label={state.label}>
                <div
                  className={
                    state.pseudo ? PSEUDO_CLASS[state.pseudo] : undefined
                  }
                >
                  <Chip
                    variant={variant}
                    size="md"
                    checked={state.checked ?? false}
                    disabled={state.disabled ?? false}
                    onChange={() => {}}
                  >
                    {LABEL}
                  </Chip>
                </div>
              </StoryRow>
            ))}
          </Stack>
        </Stack>
      ))}
    </Group>
  </StoryShowcase>
);

// A single, interactive chip. Kept inside a `Group` (flex) so the chip's
// block-display label hugs its content instead of stretching to fill the canvas.
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
};
