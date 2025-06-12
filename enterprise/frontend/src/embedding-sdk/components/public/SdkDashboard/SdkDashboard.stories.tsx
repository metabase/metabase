import { action } from "@storybook/addon-actions";
import type { Meta, StoryObj } from "@storybook/react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { dashboardIdArgType } from "embedding-sdk/test/storybook-id-args";

import { SdkDashboard } from "./SdkDashboard";

const meta: Meta<typeof SdkDashboard> = {
  title: "EmbeddingSDK/Dashboard/SdkDashboard",
  component: SdkDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    dashboardId: dashboardIdArgType,
    initialParameters: {
      control: "object",
      description: "Initial parameter values for the dashboard",
    },
    hiddenParameters: {
      control: "object",
      description: "Parameters to hide from the dashboard",
    },
    withTitle: {
      control: "boolean",
      description: "Whether to show the dashboard title",
    },
    withCardTitle: {
      control: "boolean",
      description: "Whether to show card titles",
    },
    withDownloads: {
      control: "boolean",
      description: "Whether to enable downloads",
    },
    className: {
      control: "text",
      description: "Additional CSS class name",
    },
    style: {
      control: "object",
      description: "Additional CSS styles",
    },
    onLoad: {
      action: "onLoad",
      description: "Callback when dashboard loads",
    },
    onLoadWithoutCards: {
      action: "onLoadWithoutCards",
      description: "Callback when dashboard loads without cards",
    },
    renderDrillThroughQuestion: {
      control: false,
      description: "Custom render function for drill-through questions",
    },
    plugins: {
      control: "object",
      description: "Custom plugins configuration",
    },
    drillThroughQuestionHeight: {
      control: "number",
      description: "Height for drill-through questions",
    },
    drillThroughQuestionProps: {
      control: "object",
      description: "Additional props for drill-through questions",
    },
    dashboardActions: {
      control: "object",
      description: "Custom dashboard actions",
    },
  },
};

export default meta;
type Story = StoryObj<typeof SdkDashboard>;

export const Default: Story = {
  args: {
    dashboardId: 1,
    initialParameters: {},
    hiddenParameters: [],
    withTitle: true,
    withCardTitle: true,
    withDownloads: true,
    className: "",
    style: {},
    onLoad: action("onLoad"),
    onLoadWithoutCards: action("onLoadWithoutCards"),
    plugins: {},
    drillThroughQuestionHeight: 400,
    drillThroughQuestionProps: {
      title: true,
      height: 400,
      plugins: {},
    },
  },
};

export const WithoutTitle: Story = {
  args: {
    ...Default.args,
    withTitle: false,
  },
};

export const WithoutCardTitles: Story = {
  args: {
    ...Default.args,
    withCardTitle: false,
  },
};

export const WithoutDownloads: Story = {
  args: {
    ...Default.args,
    withDownloads: false,
  },
};

export const WithCustomStyle: Story = {
  args: {
    ...Default.args,
    style: {
      padding: "20px",
      backgroundColor: "#f5f5f5",
      borderRadius: "8px",
    },
  },
};

export const WithInitialParameters: Story = {
  args: {
    ...Default.args,
    initialParameters: {
      product_category: "Gizmo",
      date_range: "yesterday",
    },
  },
};

export const WithHiddenParameters: Story = {
  args: {
    ...Default.args,
    hiddenParameters: ["date_range", "date_grouping"],
  },
};
