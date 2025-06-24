import { MetabaseProvider, defineMetabaseTheme } from "embedding-sdk";
import {
  CommonSdkStoryWrapper,
  storybookSdkAuthDefaultConfig,
} from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk/test/storybook-id-args";
import { storybookThemes } from "embedding-sdk/test/storybook-themes";

import {
  EditableDashboard,
  type EditableDashboardProps,
} from "./EditableDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

const darkTheme = storybookThemes.dark;

export default {
  title: "EmbeddingSDK/EditableDashboard",
  component: EditableDashboard,
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
export const Default = {
  render(args: EditableDashboardProps) {
    return (
      <MetabaseProvider authConfig={storybookSdkAuthDefaultConfig}>
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
    withTitle: true,
    withCardTitle: true,
    withDownloads: false,
    initialParameters: {},
    hiddenParameters: [],
  },
};

export const WithCustomGridColor = {
  render(args: EditableDashboardProps) {
    const theme = defineMetabaseTheme({
      components: { dashboard: { gridBorderColor: "#95A5A6" } },
    });

    return (
      <MetabaseProvider
        authConfig={storybookSdkAuthDefaultConfig}
        theme={theme}
      >
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
    withTitle: true,
    withCardTitle: true,
    withDownloads: false,
  },
};

export const WithDarkTheme = {
  render(args: EditableDashboardProps) {
    return (
      <MetabaseProvider
        authConfig={storybookSdkAuthDefaultConfig}
        theme={darkTheme}
      >
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
    withTitle: true,
    withCardTitle: true,
    withDownloads: false,
  },
};

export const MinimalConfiguration = {
  render(args: EditableDashboardProps) {
    return (
      <MetabaseProvider authConfig={storybookSdkAuthDefaultConfig}>
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
    withTitle: false,
    withCardTitle: false,
    withDownloads: false,
    className: "minimal-dashboard",
    style: { border: "1px solid #e0e0e0", borderRadius: "8px" },
  },
};

export const WithDownloadsEnabled = {
  render(args: EditableDashboardProps) {
    return <EditableDashboard {...args} />;
  },

  args: {
    dashboardId: DASHBOARD_ID,
    withTitle: true,
    withCardTitle: true,
    withDownloads: true,
  },
};

export const WithCustomStyling = {
  render(args: EditableDashboardProps) {
    return (
      <MetabaseProvider authConfig={storybookSdkAuthDefaultConfig}>
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
    withTitle: true,
    withCardTitle: true,
    withDownloads: false,
    className: "custom-dashboard",
    style: {
      backgroundColor: "#f8f9fa",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    },
    drillThroughQuestionHeight: "600px",
  },
};

export const WithInitialParameters = {
  render(args: EditableDashboardProps) {
    return (
      <MetabaseProvider authConfig={storybookSdkAuthDefaultConfig}>
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
    withTitle: true,
    withCardTitle: true,
    withDownloads: false,
    initialParameters: {
      // Add example parameters here - you may need to adjust based on your actual dashboard
      // date_range: "past30days",
      // category: "electronics",
    },
    hiddenParameters: [],
  },
};
