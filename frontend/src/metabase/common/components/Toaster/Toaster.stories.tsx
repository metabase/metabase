import type { StoryFn } from "@storybook/react";

import { Icon, Stack } from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

import { Toast, Toaster, type ToasterProps } from "./Toaster";

export default {
  title: "App/Dashboard/Toaster",
  component: Toaster,
  argTypes: {
    message: { control: { type: "text" } },
    confirmText: { control: { type: "text" } },
    secondaryText: { control: { type: "text" } },
    isShown: { control: { type: "boolean" } },
    fixed: { control: { type: "boolean" } },
    leftSection: {
      options: ["none", "icon"],
      mapping: {
        none: undefined,
        icon: <Icon name="model" size={16} c="tooltip-text" />,
      },
      control: { type: "radio" },
    },
    rightSection: {
      options: ["none", "icon"],
      mapping: {
        none: undefined,
        icon: <Icon name="gear" size={16} c="tooltip-text" />,
      },
      control: { type: "radio" },
    },
    onConfirm: { action: "confirmed" },
    onDismiss: { action: "dismissed" },
  },
};

const Template: StoryFn<ToasterProps> = (args) => {
  return <Toaster {...args} />;
};

export const Default = {
  render: Template,

  args: {
    message:
      "Would you like to be notified when this dashboard is done loading?",
    confirmText: "Turn on",
    secondaryText: "Later",
    isShown: true,
    fixed: false,
    leftSection: "none",
    rightSection: "none",
    onConfirm: () => {
      alert("Confirmed");
    },
    onSecondary: () => {
      alert("Secondary");
    },
    onDismiss: () => {
      alert("Dismissed");
    },
  },
};

const noop = () => undefined;

export const Overview = {
  render: () => (
    <StoryShowcase title="Toast">
      <StorySection
        title="No buttons"
        description="Message with icon and a close button."
      >
        <Stack gap="sm" align="flex-start">
          <StoryJsx>{`<Toast message="..." leftSection={<Icon name="model" size={16} />} onDismiss={...} />`}</StoryJsx>
          <Toast
            show
            message="The title goes here"
            leftSection={<Icon name="model" size={16} c="tooltip-text" />}
            onDismiss={noop}
          />
        </Stack>
      </StorySection>

      <StorySection title="One button" description="A primary confirm action.">
        <Stack gap="sm" align="flex-start">
          <StoryJsx>{`<Toast message="..." confirmText="Button" onConfirm={...} onDismiss={...} />`}</StoryJsx>
          <Toast
            show
            message="The title goes here"
            leftSection={<Icon name="model" size={16} c="tooltip-text" />}
            confirmText="Button"
            onConfirm={noop}
            onDismiss={noop}
          />
        </Stack>
      </StorySection>

      <StorySection
        title="Two buttons"
        description="Primary confirm plus a secondary action."
      >
        <Stack gap="sm" align="flex-start">
          <StoryJsx>{`<Toast message="..." confirmText="Apply" secondaryText="Cancel" onConfirm={...} onSecondary={...} />`}</StoryJsx>
          <Toast
            show
            message="The title goes here"
            leftSection={<Icon name="model" size={16} c="tooltip-text" />}
            confirmText="Apply"
            secondaryText="Cancel"
            onConfirm={noop}
            onSecondary={noop}
            onDismiss={noop}
          />
        </Stack>
      </StorySection>

      <StorySection
        title="Not closable"
        description="The close button can be hidden (as used by the dashboard filter-apply toast)."
      >
        <Stack gap="sm" align="flex-start">
          <StoryJsx>{`<Toast message="..." canClose={false} confirmText="Apply" secondaryText="Cancel" />`}</StoryJsx>
          <Toast
            show
            canClose={false}
            message="You've changed 2 filters."
            confirmText="Apply"
            secondaryText="Cancel"
            onConfirm={noop}
            onSecondary={noop}
          />
        </Stack>
      </StorySection>

      <StorySection
        title="Long message"
        description="The message wraps; buttons keep their size."
      >
        <Stack gap="sm" align="flex-start">
          <Toast
            show
            message="This is a much longer toast message that should wrap onto multiple lines to demonstrate how the toast lays out its content when the text does not fit on a single line."
            confirmText="Confirm"
            secondaryText="Cancel"
            onConfirm={noop}
            onSecondary={noop}
            onDismiss={noop}
          />
        </Stack>
      </StorySection>
    </StoryShowcase>
  ),
  parameters: {
    controls: { include: ["theme"] },
  },
};
