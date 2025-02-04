import { MetabaseProvider, defineMetabaseTheme } from "embedding-sdk";
import { storybookSdkAuthDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";
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
  argTypes: {
    dashboardId: dashboardIdArgType,
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

  args: { dashboardId: DASHBOARD_ID },
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

  args: { dashboardId: DASHBOARD_ID },
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

  args: { dashboardId: DASHBOARD_ID },
};
