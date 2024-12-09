import { MetabaseProvider, defineEmbeddingSdkTheme } from "embedding-sdk";
import { storybookSdkDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";

import {
  EditableDashboard,
  type EditableDashboardProps,
} from "./EditableDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;

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

  args: {
    dashboardId: DASHBOARD_ID,
  },
};

export const WithDarkTheme = {
  render(args: EditableDashboardProps) {
    const darkColors = {
      primary: "#DF75E9",
      filter: "#7ABBF9",
      lighterGrey: "#E3E7E4",
      lightGrey: "#ADABA9",
      darkGrey: "#3B3F3F",
      background: "#151C20",
    };

    const theme = defineEmbeddingSdkTheme({
      colors: {
        brand: darkColors.primary,
        border: darkColors.darkGrey,
        "brand-hover": darkColors.darkGrey,
        "brand-hover-light": darkColors.darkGrey,
        filter: darkColors.filter,
        "text-primary": darkColors.lighterGrey,
        "text-secondary": darkColors.lighterGrey,
        "text-tertiary": darkColors.lighterGrey,
        background: darkColors.background,
        "background-secondary": darkColors.darkGrey,
        "background-hover": darkColors.background,
        "background-disabled": darkColors.darkGrey,
      },
    });

    return (
      <MetabaseProvider config={storybookSdkDefaultConfig} theme={theme}>
        <EditableDashboard {...args} />
      </MetabaseProvider>
    );
  },

  args: {
    dashboardId: DASHBOARD_ID,
  },
};
