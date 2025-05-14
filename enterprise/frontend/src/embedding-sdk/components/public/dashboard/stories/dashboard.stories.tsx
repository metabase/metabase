/* eslint-disable no-console */
import { action } from "@storybook/addon-actions";
import type { Meta, StoryObj } from "@storybook/react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk/test/storybook-id-args";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;
// Mock component for renderDrillThroughQuestion
const MockDrillThroughQuestion = () => (
  <div>Custom Drill Through Question View</div>
);

/**
 * The SdkDashboard component provides a configurable dashboard experience.
 */
const meta: Meta<SdkDashboardProps> = {
  title: "Components/SdkDashboard",
  component: SdkDashboard,
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    // Dashboard Configuration
    mode: {
      control: "select",
      options: ["editable", "interactive", "static"],
      description: "Controls the behavior of the dashboard",
      defaultValue: "interactive",
    },
    dashboardId: dashboardIdArgType,

    // Display Options
    withTitle: {
      control: "boolean",
      description: "Whether to display the dashboard title",
      defaultValue: true,
    },
    withCardTitle: {
      control: "boolean",
      description: "Whether to display titles on dashboard cards",
      defaultValue: true,
    },
    withDownloads: {
      control: "boolean",
      description: "Whether to enable downloads for dashboard data",
      defaultValue: false,
    },
    withFooter: {
      control: "boolean",
      description: "Whether to display the footer",
      defaultValue: true,
    },
    withMetabot: {
      control: "boolean",
      description: "Whether to enable AI-powered features",
      defaultValue: false,
    },

    // Parameter Controls
    initialParameters: {
      control: "object",
      description: "Query parameters for filtering dashboard data",
      defaultValue: {},
    },
    hiddenParameters: {
      control: "array",
      description: "Parameters to hide from the UI",
      defaultValue: [],
    },

    // Drill-through Configuration
    drillThroughQuestionHeight: {
      control: { type: "number", min: 200, max: 1000, step: 50 },
      description: "Height of question when drilled through from dashboard",
    },
    useCustomDrillThrough: {
      control: "boolean",
      description: "Whether to use custom drill-through component",
      defaultValue: false,
    },
    renderDrillThroughQuestion: {
      control: false,
      description:
        "Custom React component to render the drill-through question layout",
    },

    // Event Handlers
    onLoad: {
      action: "onLoad",
      description: "Called when dashboard is loaded",
    },
    onLoadWithoutCards: {
      action: "onLoadWithoutCards",
      description: "Called when dashboard is loaded without cards",
    },

    // Plugin Configuration
    plugins: {
      control: "object",
      description: "Plugin configurations for custom actions and UI elements",
    },

    drillThroughQuestionProps: {
      control: "object",
      description: "Props for the drill-through question component",
    },
  },
};

export default meta;
type Story = StoryObj<{ useCustomDrillThrough: boolean } & SdkDashboardProps>;

/**
 * Example of the SdkDashboard component with controls.
 */
export const Dashboard: Story = {
  args: {
    mode: "interactive",
    dashboardId: DASHBOARD_ID,
    withTitle: true,
    withCardTitle: true,
    withDownloads: true,
    withFooter: true,
    withMetabot: true,
    initialParameters: { region: "west" },
    hiddenParameters: ["date"],
    drillThroughQuestionHeight: 500,
    useCustomDrillThrough: false, // New property to toggle custom drill-through
    renderDrillThroughQuestion: MockDrillThroughQuestion,
    onLoad: action("onLoad"),
    onLoadWithoutCards: action("onLoadWithoutCards"),
    plugins: {
      dashboard: {
        dashboardCardMenu: {
          withDownloads: true,
          withEditLink: true,
          withMetabot: true,
          customItems: [
            {
              name: "Custom Action",
              icon: "add",
              action: () => console.log("Custom action clicked"),
            },
          ],
        },
      },
      mapQuestionClickActions: (clickActions, clickedDataPoint) => {
        // Example of adding a custom click action
        return [
          ...clickActions,
          {
            name: "Custom Click Action",
            action: () => console.log("Custom click action", clickedDataPoint),
          },
        ];
      },
    },
    drillThroughQuestionProps: {
      title: true,
      height: 500,
      plugins: {
        dashboard: {
          dashboardCardMenu: {
            withDownloads: true,
            withEditLink: true,
            withMetabot: true,
            customItems: [
              {
                label: "Export as PDF",
                iconName: "document",
                onClick: () => console.log("Export as PDF clicked"),
              },
            ],
          },
        },
        mapQuestionClickActions: (clickActions, clickedDataPoint) => {
          // Example of adding a custom click action for drill-through questions
          return [
            ...clickActions,
            {
              name: "Analyze Further",
              action: () =>
                console.log("Analyze Further clicked", clickedDataPoint),
            },
          ];
        },
      },
    },
  },
  // Use renderDrillThroughQuestion conditionally based on useCustomDrillThrough
  render: (args) => {
    const { useCustomDrillThrough, ...restArgs } = args;
    return (
      <SdkDashboard
        {...restArgs}
        renderDrillThroughQuestion={
          useCustomDrillThrough ? MockDrillThroughQuestion : undefined
        }
      />
    );
  },
};
