import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Box, Checkbox, type CheckboxProps, Stack, Text } from "metabase/ui";
import {
  StoryBoard,
  StoryJsx,
  StorySection,
} from "metabase/ui/stories/showcase";

const args = {
  label: "Label",
  description: undefined,
  error: undefined,
  indeterminate: false,
  disabled: false,
  size: "sm",
};

const argTypes = {
  label: {
    control: { type: "text" },
  },
  description: {
    control: { type: "text" },
  },
  error: {
    control: { type: "text" },
  },
  indeterminate: {
    control: { type: "boolean" },
  },
  disabled: {
    control: { type: "boolean" },
  },
  size: {
    options: ["xs", "sm", "md"],
    control: { type: "inline-radio" },
  },
  variant: {
    options: ["default", "stacked"],
    control: { type: "inline-radio" },
  },
};

export default {
  title: "Components/Inputs/Checkbox",
  component: Checkbox,
  args,
  argTypes,
};

export const Default = {};

const SIZES = ["xs", "sm", "md"] as const;
const VARIANTS = ["default", "stacked"] as const;

const STATES = [
  { id: "default", attrs: "", props: {} },
  { id: "checked", attrs: " defaultChecked", props: { defaultChecked: true } },
  {
    id: "indeterminate",
    attrs: " defaultChecked indeterminate",
    props: { defaultChecked: true, indeterminate: true },
  },
  { id: "disabled", attrs: " disabled", props: { disabled: true } },
  {
    id: "disabled-checked",
    attrs: " disabled defaultChecked",
    props: { disabled: true, defaultChecked: true },
  },
  {
    id: "disabled-indeterminate",
    attrs: " disabled defaultChecked indeterminate",
    props: { disabled: true, defaultChecked: true, indeterminate: true },
  },
];

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "20rem repeat(3, minmax(0, 1fr))",
  columnGap: "2rem",
  rowGap: "0.75rem",
  alignItems: "center",
} as const;

const SizeHeader = () => (
  <>
    <div />
    {SIZES.map((size) => (
      <Text key={size} size="sm" fw="bold" c="text-secondary">
        {size}
      </Text>
    ))}
  </>
);

const VariantSection = ({
  variant,
  label,
}: {
  variant: (typeof VARIANTS)[number];
  label: CheckboxProps["label"];
}) => {
  const variantAttr = variant === "default" ? "" : ` variant="${variant}"`;

  return (
    <StorySection title={variant[0].toUpperCase() + variant.slice(1)}>
      <Box style={gridStyle}>
        {STATES.map(({ id, attrs, props }) => (
          <Fragment key={id}>
            <StoryJsx>{`<Checkbox${variantAttr}${attrs} />`}</StoryJsx>
            {SIZES.map((size) => (
              <Checkbox
                key={size}
                size={size}
                variant={variant}
                label={label}
                {...props}
              />
            ))}
          </Fragment>
        ))}
      </Box>
    </StorySection>
  );
};

const OverviewTemplate: StoryFn<CheckboxProps> = ({ label }) => (
  <StoryBoard title="Checkbox" padding="2rem">
    <StorySection title="Sizes" description="Note: the default size is “sm”.">
      <Box style={gridStyle}>
        <SizeHeader />
        <StoryJsx>{`<Checkbox size="…" />`}</StoryJsx>
        {SIZES.map((size) => (
          <Checkbox key={size} size={size} defaultChecked />
        ))}
      </Box>
    </StorySection>

    {VARIANTS.map((variant) => (
      <VariantSection key={variant} variant={variant} label={label} />
    ))}

    <StorySection title="Description and error">
      <Box style={gridStyle}>
        <StoryJsx>{`<Checkbox description="…" />`}</StoryJsx>
        {SIZES.map((size) => (
          <Checkbox
            key={size}
            size={size}
            label={label}
            description="A short explanation"
          />
        ))}
        <StoryJsx>{`<Checkbox error="…" />`}</StoryJsx>
        {SIZES.map((size) => (
          <Checkbox
            key={size}
            size={size}
            label={label}
            error="Something went wrong"
          />
        ))}
      </Box>
    </StorySection>
  </StoryBoard>
);

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    controls: { include: ["label"] },
  },
};

const GroupsTemplate: StoryFn<CheckboxProps> = () => (
  <StoryBoard title="Checkbox.Group">
    <Stack gap="1.5rem">
      <StoryJsx>{"<Checkbox.Group />"}</StoryJsx>
      <Checkbox.Group
        defaultValue={["react"]}
        label="An array of good frameworks"
        description="But which one to use?"
      >
        <Stack gap="0.75rem" mt="1rem" w="16rem">
          <Checkbox value="react" label="React" />
          <Checkbox value="svelte" label="Svelte" />
          <Checkbox value="ng" label="Angular" />
          <Checkbox value="vue" label="Vue" />
        </Stack>
      </Checkbox.Group>
    </Stack>
    <Stack gap="1.5rem">
      <StoryJsx>
        {"<Checkbox.Group><Checkbox.Card /></Checkbox.Group>"}
      </StoryJsx>
      <Checkbox.Group
        defaultValue={["react"]}
        label="An array of good frameworks"
        description="But which one to use?"
      >
        <Stack gap="0.375rem" mt="1rem" w="16rem">
          <Checkbox.Card
            value="react"
            label="React"
            description="A library for building user interfaces"
          />
          <Checkbox.Card
            value="svelte"
            label="Svelte"
            description="Cybernetically enhanced web apps"
          />
          <Checkbox.Card
            value="ng"
            label="Angular"
            description="The web development framework for modern apps"
          />
          <Checkbox.Card
            value="vue"
            label="Vue"
            description="The progressive JavaScript framework"
          />
        </Stack>
      </Checkbox.Group>
    </Stack>
  </StoryBoard>
);

export const Groups = {
  render: GroupsTemplate,
  parameters: {
    controls: { disable: true },
  },
};

type CardState = {
  id: string;
  label: string;
  checked?: boolean;
  hovered?: boolean;
  disabled?: boolean;
};

const CARD_STATES: CardState[] = [
  { id: "default", label: "Default" },
  { id: "hover", label: "Hover", hovered: true },
  { id: "selected", label: "Selected", checked: true },
  {
    id: "selected-hover",
    label: "Selected - Hover",
    checked: true,
    hovered: true,
  },
  { id: "disabled", label: "Disabled", disabled: true },
  {
    id: "disabled-checked",
    label: "Disabled - Checked",
    checked: true,
    disabled: true,
  },
];

const CardTemplate: StoryFn<CheckboxProps> = () => (
  <StoryBoard title="Checkbox.Card">
    <Stack gap="1.5rem">
      <StoryJsx>{"<Checkbox.Card />"}</StoryJsx>
      {CARD_STATES.map((state) => (
        <Stack key={state.id} gap="0.75rem">
          <Text size="sm" c="text-secondary">
            {state.label}
          </Text>
          <Checkbox.Card
            w="16rem"
            label="React"
            description="A library for building user interfaces"
            defaultChecked={state.checked ?? false}
            disabled={state.disabled ?? false}
            data-state-row={state.id}
          />
        </Stack>
      ))}
    </Stack>
  </StoryBoard>
);

export const Card = {
  render: CardTemplate,
  name: "Checkbox.Card",
  parameters: {
    pseudo: {
      hover: CARD_STATES.filter((state) => state.hovered).map(
        (state) => `[data-state-row="${state.id}"]`,
      ),
    },
    controls: { disable: true },
  },
};
