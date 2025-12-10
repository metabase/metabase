import { storybookSdkAuthDefaultConfig } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk-bundle/test/storybook-id-args";
import { storybookThemes } from "embedding-sdk-bundle/test/storybook-themes";
import { defineMetabaseTheme } from "metabase/embedding-sdk/theme";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Paper,
  Popover,
  Stack,
  Title,
} from "metabase/ui";

import { ComponentProvider } from "../ComponentProvider";
import { SdkQuestion } from "../SdkQuestion";

import { SdkDashboard, type SdkDashboardProps } from "./SdkDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

const darkTheme = storybookThemes.dark;

export default {
  title: "EmbeddingSDK/SdkDashboard",
  component: SdkDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [],
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
  render(args: SdkDashboardProps) {
    return (
      <ComponentProvider authConfig={storybookSdkAuthDefaultConfig}>
        <SdkDashboard {...args} />
      </ComponentProvider>
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

export const WithCustomQuestionLayout = {
  render(args: SdkDashboardProps) {
    return (
      <ComponentProvider authConfig={storybookSdkAuthDefaultConfig}>
        <SdkDashboard {...args} />
      </ComponentProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
    renderDrillThroughQuestion: () => (
      <Stack>
        <SdkQuestion.Title />
        <SdkQuestion.QuestionVisualization />
        <div>This is a custom question layout.</div>
      </Stack>
    ),
  },
};

export const WithCustomGridColor = {
  render(args: SdkDashboardProps) {
    const theme = defineMetabaseTheme({
      components: { dashboard: { gridBorderColor: "#95A5A6" } },
    });

    return (
      <ComponentProvider
        authConfig={storybookSdkAuthDefaultConfig}
        theme={theme}
      >
        <SdkDashboard {...args} />
      </ComponentProvider>
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
  render(args: SdkDashboardProps) {
    return (
      <ComponentProvider
        authConfig={storybookSdkAuthDefaultConfig}
        theme={darkTheme}
      >
        <SdkDashboard {...args} />
      </ComponentProvider>
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
  render(args: SdkDashboardProps) {
    return (
      <ComponentProvider authConfig={storybookSdkAuthDefaultConfig}>
        <SdkDashboard {...args} />
      </ComponentProvider>
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
  render(args: SdkDashboardProps) {
    return (
      <ComponentProvider authConfig={storybookSdkAuthDefaultConfig}>
        <SdkDashboard {...args} />
      </ComponentProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
    withTitle: true,
    withCardTitle: true,
    withDownloads: true,
  },
};

export const WithCustomStyling = {
  render(args: SdkDashboardProps) {
    return (
      <ComponentProvider authConfig={storybookSdkAuthDefaultConfig}>
        <SdkDashboard {...args} />
      </ComponentProvider>
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
  render(args: SdkDashboardProps) {
    return (
      <ComponentProvider authConfig={storybookSdkAuthDefaultConfig}>
        <SdkDashboard {...args} />
      </ComponentProvider>
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

export const ExperimentalLayout = {
  render(args: SdkDashboardProps) {
    return (
      <ComponentProvider authConfig={storybookSdkAuthDefaultConfig}>
        <Paper
          display="flex"
          p="xl"
          pos="relative"
          style={{ flexDirection: "row", overflow: "none" }}
          h="40rem"
        >
          <SdkDashboard {...args}>
            <Flex pos="sticky" justify="apart" w="100%">
              <Title order={2}>
                <SdkDashboard.Title />
              </Title>
              <Popover>
                <Popover.Target>
                  <ActionIcon>
                    <Icon name="ellipsis" />
                  </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown>
                  <Paper>
                    <SdkDashboard.ExportAsPdfButton />
                    <SdkDashboard.InfoButton />
                    <SdkDashboard.RefreshPeriod />
                  </Paper>
                </Popover.Dropdown>
              </Popover>
            </Flex>
            <Flex flex={1} w="100%" h="100%" style={{ overflow: "none" }}>
              <Box>
                <SdkDashboard.ParametersList vertical />
              </Box>

              <Box flex={1} style={{ overflowY: "scroll" }}>
                <SdkDashboard.Grid />
              </Box>
            </Flex>
          </SdkDashboard>
        </Paper>
      </ComponentProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
  },
};
