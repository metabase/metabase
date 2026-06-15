import type { StoryFn, StoryObj } from "@storybook/react";
import { Fragment } from "react";

import { Group, Kbd, type KbdProps, Stack } from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

const argTypes = {
  children: {
    control: { type: "text" },
  },
};

export default {
  title: "Components/Data display/Kbd",
  component: Kbd,
  args: {
    children: "⌘",
  },
  argTypes,
};

const Template: StoryFn<KbdProps> = (args) => {
  return <Kbd {...args} />;
};

export const Default = {
  render: Template,
};

type State = {
  id: string;
  label: string;
  props?: Partial<KbdProps> & Record<`data-${string}`, unknown>;
};

const STATES: State[] = [
  { id: "default", label: "Default" },
  { id: "hover", label: "Hover", props: { "data-state-row": "hover" } },
  { id: "disabled", label: "Disabled", props: { disabled: true } },
];

const EXAMPLES = ["⌘", "A", "Shift"];

const LABEL_WIDTH = "6rem";

function StatesMatrix({ content }: { content?: KbdProps["children"] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${LABEL_WIDTH} repeat(${EXAMPLES.length}, max-content)`,
        alignItems: "center",
        justifyItems: "start",
        columnGap: "2rem",
        rowGap: "1rem",
      }}
    >
      <span />
      {EXAMPLES.map((example) => (
        <StoryJsx key={example}>{`<Kbd>${example}</Kbd>`}</StoryJsx>
      ))}

      {STATES.map((state) => (
        <Fragment key={state.id}>
          <span style={{ color: "var(--mb-color-text-secondary)" }}>
            {state.label}
          </span>
          {EXAMPLES.map((example) => (
            <Kbd key={example} {...state.props}>
              {content ?? example}
            </Kbd>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function Shortcut({ keys, disabled }: { keys: string[]; disabled?: boolean }) {
  return (
    <Group gap="0.25rem">
      {keys.map((key) => (
        <Kbd key={key} disabled={disabled}>
          {key}
        </Kbd>
      ))}
    </Group>
  );
}

function SequentialShortcut({ steps }: { steps: string[][] }) {
  return (
    <Group gap="0.5rem">
      {steps.map((keys, index) => (
        <Fragment key={keys.join("-")}>
          {index > 0 && (
            <span style={{ color: "var(--mb-color-text-secondary)" }}>
              {" > "}
            </span>
          )}
          <Shortcut keys={keys} />
        </Fragment>
      ))}
    </Group>
  );
}

export const Overview: StoryObj<KbdProps> = {
  render: ({ children }) => (
    <StoryShowcase title="Kbd">
      <StorySection
        title="States"
        description="A single size. Hover is a passive visual affordance (e.g. for a tooltip)."
      >
        <StatesMatrix content={children} />
      </StorySection>

      <StorySection
        title="In use"
        description={`Shortcuts compose one Kbd per key.`}
      >
        <Stack gap="md">
          <Shortcut keys={["Shift", "⌘", "P"]} />
          <Shortcut keys={["⌘", "C"]} disabled />
          <SequentialShortcut steps={[["G"], ["C"]]} />
          <SequentialShortcut steps={[["⌘", "K"], ["↑"]]} />
        </Stack>
      </StorySection>
    </StoryShowcase>
  ),
  args: {
    children: undefined,
  },
  argTypes: {
    children: { control: { type: "text" } },
  },
  parameters: {
    controls: { include: ["children", "theme"] },
    pseudo: { hover: "[data-state-row='hover']" },
  },
};
