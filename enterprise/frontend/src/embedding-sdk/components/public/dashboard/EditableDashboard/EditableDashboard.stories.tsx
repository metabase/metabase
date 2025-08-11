import type { Meta, StoryObj } from "@storybook/react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk/test/storybook-id-args";

import type { SdkQuestionProps } from "../../SdkQuestion";

import {
  EditableDashboard,
  type EditableDashboardProps,
} from "./EditableDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

type CustomArgs = {
  "dataPickerProps.entityTypes"?: SdkQuestionProps["entityTypes"];
};

const meta = {
  title: "EmbeddingSDK/EditableDashboard",
  component: EditableDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    // Core props
    dashboardId: dashboardIdArgType,

    "dataPickerProps.entityTypes": {
      control: "check",
      options: [
        "model",
        "table",
        "question",
      ] satisfies SdkQuestionProps["entityTypes"],
      description: "`question` doesn't have effect on simple data picker",
    },

    // Display options
    withTitle: {
      control: { type: "boolean" },
      description: "Whether to show the dashboard title",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "true" },
      },
    },
    withCardTitle: {
      control: { type: "boolean" },
      description: "Whether to show individual card titles",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "true" },
      },
    },
    withDownloads: {
      control: { type: "boolean" },
      description: "Whether to enable download functionality for cards",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
      },
    },

    // Parameters
    initialParameters: {
      control: { type: "object" },
      description: "Initial parameter values for the dashboard",
      table: {
        type: { summary: "Record<string, any>" },
        defaultValue: { summary: "{}" },
      },
    },
    hiddenParameters: {
      control: { type: "object" },
      description: "Array of parameter names to hide from the dashboard",
      table: {
        type: { summary: "string[]" },
        defaultValue: { summary: "[]" },
      },
    },

    // Styling
    className: {
      control: { type: "text" },
      description: "CSS class name for the dashboard wrapper",
      table: {
        type: { summary: "string" },
      },
    },
    style: {
      control: { type: "object" },
      description: "Inline styles for the dashboard wrapper",
      table: {
        type: { summary: "CSSProperties" },
      },
    },

    // Drill-through question options
    drillThroughQuestionHeight: {
      control: { type: "text" },
      description: "Height of the drill-through question component",
      table: {
        type: { summary: "CSSProperties['height']" },
      },
    },
    drillThroughQuestionProps: {
      control: { type: "object" },
      description: "Props passed to the drill-through question component",
      table: {
        type: { summary: "DrillThroughQuestionProps" },
      },
    },
    renderDrillThroughQuestion: {
      control: false,
      description: "Custom React component to render the question layout",
      table: {
        type: { summary: "() => ReactNode" },
      },
    },

    // Plugins
    plugins: {
      control: { type: "object" },
      description:
        "Additional mapper function to override or add drill-down menu",
      table: {
        type: { summary: "MetabasePluginsConfig" },
      },
    },

    // Event handlers
    onLoad: {
      control: false,
      description: "Callback fired when the dashboard loads successfully",
      table: {
        type: { summary: "(dashboard: Dashboard) => void" },
      },
      action: "onLoad",
    },
    onLoadWithoutCards: {
      control: false,
      description: "Callback fired when the dashboard loads without cards",
      table: {
        type: { summary: "(dashboard: Dashboard) => void" },
      },
      action: "onLoadWithoutCards",
    },
  },
  render: ({ "dataPickerProps.entityTypes": entityTypes, ...args }) => {
    return (
      <EditableDashboard
        {...args}
        dataPickerProps={{
          entityTypes,
        }}
      />
    );
  },
} satisfies Meta<EditableDashboardProps & CustomArgs>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {
  args: {
    dashboardId: DASHBOARD_ID,
  },
} satisfies Story;
