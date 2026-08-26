import type { StoryFn } from "@storybook/react";

import {
  KeyboardShortcut,
  type KeyboardShortcutProps,
  Stack,
} from "metabase/ui";
import { StorySection, StoryShowcase } from "metabase/ui/stories/showcase";

export default {
  title: "Components/Data display/KeyboardShortcut",
  component: KeyboardShortcut,
  args: {
    shortcut: "$mod+k",
  },
  argTypes: {
    shortcut: {
      control: { type: "text" },
    },
  },
};

const Template: StoryFn<KeyboardShortcutProps> = (args) => (
  <KeyboardShortcut {...args} />
);

export const Default = {
  render: Template,
};

export const Overview = {
  render: () => (
    <StoryShowcase title="Keyboard Shortcut">
      <StorySection
        title="Simultaneous"
        description="Keys pressed together render adjacent, with no separator."
      >
        <Stack gap="md" align="flex-start">
          <KeyboardShortcut shortcut="$mod+k" />
          <KeyboardShortcut shortcut="Shift+$mod+p" />
          <KeyboardShortcut shortcut="$mod+backspace" />
          <KeyboardShortcut shortcut="Alt+ArrowUp" />
        </Stack>
      </StorySection>

      <StorySection
        title="Sequential"
        description={`Keys pressed one after another are joined by "then".`}
      >
        <Stack gap="md" align="flex-start">
          <KeyboardShortcut shortcut="c q" />
          <KeyboardShortcut shortcut="c e" />
        </Stack>
      </StorySection>
    </StoryShowcase>
  ),
  parameters: {
    controls: { include: ["theme"] },
  },
};
