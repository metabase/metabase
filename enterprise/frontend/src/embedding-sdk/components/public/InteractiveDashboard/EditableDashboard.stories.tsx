import { MetabaseProvider, defineEmbeddingSdkTheme } from "embedding-sdk";
import { storybookSdkDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { getSdkStorybookDarkTheme } from "embedding-sdk/test/storybook-dark-theme";

import {
  EditableDashboard,
  type EditableDashboardProps,
} from "./EditableDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;

const darkTheme = getSdkStorybookDarkTheme();

export default {
  title: "EmbeddingSDK/EditableDashboard",
  component: EditableDashboard,
  parameters: {
    layout: "fullscreen",
  },
};

export const Default = {
  render(args: EditableDashboardProps) {
    return (
      <MetabaseProvider config={storybookSdkDefaultConfig}>
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: { dashboardId: DASHBOARD_ID },
};

export const WithCustomGridColor = {
  render(args: EditableDashboardProps) {
    const theme = defineEmbeddingSdkTheme({
      components: { dashboard: { gridBorderColor: "#95A5A6" } },
    });

    return (
      <MetabaseProvider config={storybookSdkDefaultConfig} theme={theme}>
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: { dashboardId: DASHBOARD_ID },
};

export const WithDarkTheme = {
  render(args: EditableDashboardProps) {
    return (
      <MetabaseProvider config={storybookSdkDefaultConfig} theme={darkTheme}>
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: { dashboardId: DASHBOARD_ID },
};
