import type { StoryFn } from "@storybook/react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk-bundle/test/storybook-id-args";

import {
  InteractiveDashboard,
  type InteractiveDashboardProps,
} from "./InteractiveDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

export default {
  title: "EmbeddingSDK/InteractiveDashboard",
  component: InteractiveDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    // Core props
    dashboardId: dashboardIdArgType,

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
    withSubscriptions: {
      control: { type: "boolean" },
      description:
        "Whether to allow users to subscribe themselves to the dashboard",
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
};

const Template: StoryFn<InteractiveDashboardProps> = (args) => {
  return <InteractiveDashboard {...args} />;
};

export const Default = {
  render: Template,

  args: {
    dashboardId: DASHBOARD_ID,
  },
};
