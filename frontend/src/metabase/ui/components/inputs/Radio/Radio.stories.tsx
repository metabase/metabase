import type { StoryFn } from "@storybook/react";
import { Fragment, useState } from "react";

import { Box, Radio, type RadioProps, Stack, Text } from "metabase/ui";
import {
  StoryBoard,
  StoryJsx,
  StorySection,
} from "metabase/ui/stories/showcase";

const args = {
  label: "Label",
  description: undefined,
  error: undefined,
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
  disabled: {
    control: { type: "boolean" },
  },
};

export default {
  title: "Components/Inputs/Radio",
  component: Radio,
  args,
  argTypes,
};

export const Default = {};

const OVERVIEW_STATES = [
  { id: "default", attrs: "", props: {} },
  { id: "checked", attrs: " defaultChecked", props: { defaultChecked: true } },
  { id: "disabled", attrs: " disabled", props: { disabled: true } },
  {
    id: "disabled-checked",
    attrs: " disabled defaultChecked",
    props: { disabled: true, defaultChecked: true },
  },
];

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "18rem 20rem",
  columnGap: "1.5rem",
  rowGap: "1rem",
  alignItems: "center",
} as const;

const OverviewTemplate: StoryFn<RadioProps> = () => (
  <StoryBoard title="Radio" padding="2rem">
    <StorySection title="States">
      <Box style={gridStyle}>
        {OVERVIEW_STATES.map(({ id, attrs, props }) => (
          <Fragment key={id}>
            <StoryJsx>{`<Radio label="…" description="…"${attrs} />`}</StoryJsx>
            <Radio
              label="Label"
              description="Description"
              wrapperProps={{ "data-testid": `radio-overview-${id}` }}
              {...props}
            />
          </Fragment>
        ))}
      </Box>
    </StorySection>

    <StorySection title="Label only">
      <Box style={gridStyle}>
        {OVERVIEW_STATES.map(({ id, attrs, props }) => (
          <Fragment key={id}>
            <StoryJsx>{`<Radio label="…"${attrs} />`}</StoryJsx>
            <Radio label="Label" {...props} />
          </Fragment>
        ))}
      </Box>
    </StorySection>

    <StorySection title="Error">
      <Box style={gridStyle}>
        <StoryJsx>{`<Radio error="…" />`}</StoryJsx>
        <Radio
          label="Label"
          description="Description"
          error="Something went wrong"
        />
      </Box>
    </StorySection>
  </StoryBoard>
);

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    controls: { disable: true },
  },
};

const GroupsTemplate: StoryFn<RadioProps> = () => (
  <StoryBoard title="Radio.Group">
    <Stack gap="1.5rem">
      <StoryJsx>{"<Radio.Group />"}</StoryJsx>
      <Radio.Group
        defaultValue="react"
        label="An array of good frameworks"
        description="But which one to use?"
      >
        <Stack gap="0.75rem" mt="1rem" w="16rem">
          <Radio value="react" label="React" />
          <Radio value="svelte" label="Svelte" />
          <Radio value="ng" label="Angular" />
          <Radio value="vue" label="Vue" />
        </Stack>
      </Radio.Group>
    </Stack>
    <Stack gap="1.5rem">
      <StoryJsx>{"<Radio.Group><Radio.Card /></Radio.Group>"}</StoryJsx>
      <Radio.Group
        defaultValue="react"
        label="An array of good frameworks"
        description="But which one to use?"
      >
        <Stack gap="0.375rem" mt="1rem" w="16rem">
          <Radio.Card
            value="react"
            label="React"
            description="A library for building user interfaces"
          />
          <Radio.Card
            value="svelte"
            label="Svelte"
            description="Cybernetically enhanced web apps"
          />
          <Radio.Card
            value="ng"
            label="Angular"
            description="The web development framework for modern apps"
          />
          <Radio.Card
            value="vue"
            label="Vue"
            description="The progressive JavaScript framework"
          />
        </Stack>
      </Radio.Group>
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

const CardTemplate: StoryFn<RadioProps> = () => (
  <StoryBoard title="Radio.Card" background="background_page-primary">
    <Stack gap="1.5rem">
      <StoryJsx>{"<Radio.Card />"}</StoryJsx>
      {CARD_STATES.map((state) => (
        <Stack key={state.id} gap="0.75rem">
          <Text size="sm" c="text-secondary">
            {state.label}
          </Text>
          <Radio.Card
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
  name: "Radio.Card",
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
  `<Radio.Group>`,
  ...INTERACTIVE_CARDS.map(({ attrs }) => `  <Radio.Card${attrs} />`),
  `</Radio.Group>`,
].join("\n");

const InteractiveCardTemplate: StoryFn<RadioProps> = () => {
  const [value, setValue] = useState("react");

  return (
    <StoryBoard title="Radio.Card" background="background_page-primary">
      <Stack gap="1.5rem">
        <StoryJsx>{INTERACTIVE_JSX}</StoryJsx>
        <Radio.Group value={value} onChange={setValue}>
          <Stack gap="0.375rem" w="16rem">
            {INTERACTIVE_CARDS.map(({ value, label, description, props }) => (
              <Radio.Card
                key={value}
                value={value}
                label={label}
                description={description}
                {...props}
              />
            ))}
          </Stack>
        </Radio.Group>
      </Stack>
    </StoryBoard>
  );
};

export const InteractiveCard = {
  render: InteractiveCardTemplate,
  name: "Radio.Card (interactive)",
  parameters: {
    controls: { disable: true },
    loki: { skip: true },
  },
};
