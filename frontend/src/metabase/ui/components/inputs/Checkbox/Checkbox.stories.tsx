import type { StoryFn } from "@storybook/react";
import { Fragment, useState } from "react";

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
  gridTemplateColumns: "20rem minmax(0, 1fr)",
  columnGap: "2rem",
  rowGap: "0.75rem",
  alignItems: "center",
} as const;

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
            <Checkbox variant={variant} label={label} {...props} />
          </Fragment>
        ))}
      </Box>
    </StorySection>
  );
};

const OverviewTemplate: StoryFn<CheckboxProps> = ({ label }) => (
  <StoryBoard title="Checkbox" padding="2rem">
    {VARIANTS.map((variant) => (
      <VariantSection key={variant} variant={variant} label={label} />
    ))}

    <StorySection title="Description and error">
      <Box style={gridStyle}>
        <StoryJsx>{`<Checkbox description="…" />`}</StoryJsx>
        <Checkbox label={label} description="A short explanation" />
        <StoryJsx>{`<Checkbox error="…" />`}</StoryJsx>
        <Checkbox label={label} error="Something went wrong" />
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
  <StoryBoard title="Checkbox.Card" background="background_page-primary">
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
            checked={state.checked ?? false}
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

const INTERACTIVE_CARDS = [
  {
    value: "react",
    label: "React",
    description: "A library for building user interfaces",
    attrs: "",
    props: {},
  },
  {
    value: "svelte",
    label: "Svelte",
    description: "Cybernetically enhanced web apps",
    attrs: "",
    props: {},
  },
  {
    value: "ng",
    label: "Angular",
    description: "The web development framework for modern apps",
    attrs: " disabled",
    props: { disabled: true },
  },
  {
    value: "vue",
    label: "Vue",
    description: "The progressive JavaScript framework",
    attrs: " withIndicator={false}",
    props: { withIndicator: false },
  },
];

const INTERACTIVE_JSX = [
  `<Checkbox.Group>`,
  ...INTERACTIVE_CARDS.map(({ attrs }) => `  <Checkbox.Card${attrs} />`),
  `</Checkbox.Group>`,
].join("\n");

const InteractiveCardTemplate: StoryFn<CheckboxProps> = () => {
  const [value, setValue] = useState(["react"]);

  return (
    <StoryBoard title="Checkbox.Card" background="background_page-primary">
      <Stack gap="1.5rem">
        <StoryJsx>{INTERACTIVE_JSX}</StoryJsx>
        <Checkbox.Group value={value} onChange={setValue}>
          <Stack gap="0.375rem" w="16rem">
            {INTERACTIVE_CARDS.map(({ value, label, description, props }) => (
              <Checkbox.Card
                key={value}
                value={value}
                label={label}
                description={description}
                {...props}
              />
            ))}
          </Stack>
        </Checkbox.Group>
      </Stack>
    </StoryBoard>
  );
};

export const InteractiveCard = {
  render: InteractiveCardTemplate,
  name: "Checkbox.Card (interactive)",
  parameters: {
    controls: { disable: true },
    loki: { skip: true },
  },
};
