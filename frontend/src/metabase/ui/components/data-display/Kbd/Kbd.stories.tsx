import type { StoryFn } from "@storybook/react";

import { Group, Kbd, type KbdProps } from "metabase/ui";
import { StorySection, StoryShowcase } from "metabase/ui/stories/showcase";

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

const Template: StoryFn<KbdProps> = (args) => <Kbd {...args} />;

export const Default = {
  render: Template,
};

const EXAMPLE_KEYS = ["⌘", "⇧", "⌥", "A", "Esc", "↑"];

export const Overview = {
  render: () => (
    <StoryShowcase title="Kbd">
      <StorySection
        title="Building block"
        description="Kbd renders a single key of a shortcut. Use KeyboardShortcut to render whole shortcut rather than using Kbd directly."
      >
        <Group gap="xs">
          {EXAMPLE_KEYS.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </Group>
      </StorySection>
    </StoryShowcase>
  ),
  parameters: {
    controls: { include: ["theme"] },
  },
};
