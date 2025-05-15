import type { ArgTypes } from "storybook/internal/types";

import { dashboardIdArgType } from "embedding-sdk/test/storybook-id-args";

import type { MetabaseProviderProps } from "../../MetabaseProvider";
import type { SdkDashboardProps } from "../SdkDashboard";

export type DashboardStoryArgTypes = SdkDashboardProps & {
  useCustomDrillThrough: boolean;
} & Pick<MetabaseProviderProps, "theme">;

export const dashboardStoryArgTypes: ArgTypes<DashboardStoryArgTypes> = {
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
    control: "object",
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
};
