import type { Meta, StoryObj } from "@storybook/react";

import { Box, Group, Stack, Text } from "metabase/ui";
import { StoryBoard } from "metabase/ui/stories/showcase";

import S from "../DashCard.module.css";

import { DashCardMenuButton } from "./DashCardMenuButton";

const STATES = [
  { id: "card-default", label: "Card default" },
  { id: "card-hover", label: "Card hover" },
  { id: "button-hover", label: "Button hover" },
  { id: "button-pressed", label: "Button pressed" },
  { id: "button-focus", label: "Button focus" },
] as const;

const rowSelector = (id: (typeof STATES)[number]["id"]) =>
  `[data-state-row="${id}"]`;

const meta: Meta<typeof DashCardMenuButton> = {
  title: "App/Embed/DashCardMenuButton",
  component: DashCardMenuButton,
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
    pseudo: {
      hover: [
        `${rowSelector("card-hover")} [data-state-card]`,
        `${rowSelector("button-hover")} [data-state-card]`,
        `${rowSelector("button-hover")} button`,
        `${rowSelector("button-pressed")} [data-state-card]`,
      ],
      active: [`${rowSelector("button-pressed")} button`],
      focusVisible: [`${rowSelector("button-focus")} button`],
    },
  },
};

export default meta;
type Story = StoryObj<typeof DashCardMenuButton>;

export const States: Story = {
  render: () => (
    <StoryBoard
      title="Dash card menu button"
      background="background_page-primary"
      padding="2rem"
    >
      <Group align="flex-start" gap="xl">
        {STATES.map(({ id, label }) => (
          <Stack key={id} data-state-row={id} gap="sm">
            <Text c="text-secondary" size="sm">
              {label}
            </Text>
            <Box
              data-state-card
              className={S.DashCardRoot}
              pos="relative"
              w="12rem"
              h="6rem"
            >
              <Box pos="absolute" top="0.75rem" right="1rem">
                <DashCardMenuButton />
              </Box>
            </Box>
          </Stack>
        ))}
      </Group>
    </StoryBoard>
  ),
};
