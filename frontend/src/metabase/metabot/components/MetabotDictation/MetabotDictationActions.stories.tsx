import type { Meta, StoryObj } from "@storybook/react";

import { Box } from "metabase/ui";

import { MetabotDictationActions } from "./MetabotDictationActions";

const meta: Meta<typeof MetabotDictationActions> = {
  title: "App/Metabot/Dictation",
  component: MetabotDictationActions,
  decorators: [
    (Story) => (
      <Box w={320} p="md">
        <Story />
      </Box>
    ),
  ],
  args: {
    available: true,
    canSend: true,
    isResponding: false,
    state: { status: "idle" },
    onStart: () => {},
    onCancel: () => {},
    onStop: () => {},
    onSend: () => {},
    onRetry: () => {},
    onStopResponse: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof MetabotDictationActions>;

export const Ready: Story = {};
export const WaitingForPermission: Story = {
  args: { state: { status: "requesting" } },
};
export const Transcribing: Story = {
  args: { state: { status: "transcribing" } },
};
export const Failed: Story = {
  args: {
    state: {
      status: "error",
      canRetry: true,
      message: "Could not transcribe the recording. Please try again.",
    },
  },
};
export const Recording: Story = {
  render: (args) => (
    <MetabotDictationActions
      {...args}
      state={{ status: "recording", stream: new MediaStream() }}
    />
  ),
};
