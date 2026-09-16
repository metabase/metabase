import type { Meta, StoryObj } from "@storybook/react";

import { Box } from "metabase/ui";

import { MetabotPromptSuggestions } from "./MetabotPromptSuggestions";

const meta: Meta<typeof MetabotPromptSuggestions> = {
  title: "App/Metabot/Prompt suggestions",
  component: MetabotPromptSuggestions,
  decorators: [
    (Story) => (
      <Box w={360} p="md">
        <Story />
      </Box>
    ),
  ],
  args: {
    prompts: [
      "Show monthly sales trends",
      "Compare sales by product category",
      "Break down revenue by new and returning customers",
    ],
    onSubmit: () => {},
    onFocusInput: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof MetabotPromptSuggestions>;

export const ThreeSuggestions: Story = {};
export const TwoSuggestions: Story = {
  args: {
    prompts: ["Show monthly sales trends", "Compare sales by product category"],
  },
};
