import { MetabaseProvider, defineMetabaseTheme } from "embedding-sdk";
import { storybookSdkAuthDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk/test/storybook-id-args";
import { storybookThemes } from "embedding-sdk/test/storybook-themes";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

const darkTheme = storybookThemes.dark;

export default {
  title: "EmbeddingSDK/SdkDashboard/Editable",
  component: SdkDashboard,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    dashboardId: dashboardIdArgType,
  },
};

export const Default = {
  render(args: SdkDashboardProps) {
    return (
      <MetabaseProvider authConfig={storybookSdkAuthDefaultConfig}>
        <SdkDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: { dashboardId: DASHBOARD_ID },
};

export const WithCustomGridColor = {
  render(args: SdkDashboardProps) {
    const theme = defineMetabaseTheme({
      components: { dashboard: { gridBorderColor: "#95A5A6" } },
    });

    return (
      <MetabaseProvider
        authConfig={storybookSdkAuthDefaultConfig}
        theme={theme}
      >
        <SdkDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: { dashboardId: DASHBOARD_ID },
};

export const WithDarkTheme = {
  render(args: SdkDashboardProps) {
    return (
      <MetabaseProvider
        authConfig={storybookSdkAuthDefaultConfig}
        theme={darkTheme}
      >
        <SdkDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: { dashboardId: DASHBOARD_ID },
};
