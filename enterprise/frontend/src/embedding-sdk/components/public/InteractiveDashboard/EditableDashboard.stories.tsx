import { MetabaseProvider, defineMetabaseTheme } from "embedding-sdk";
import { storybookSdkAuthDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { getSdkStorybookDarkTheme } from "embedding-sdk/test/storybook-dark-theme";

import {
  EditableDashboard,
  type EditableDashboardProps,
} from "./EditableDashboard";

const ENTITY_ID = "xBLdW9FsgRuB2HGhWiBa_";
const ONE_TOO_MANY_ENTITY_ID = ENTITY_ID + "1";
const WRONG_ENTITY_ID = ENTITY_ID.slice(0, -1) + "1";
const NUMBER_ID = 1;
const WRONG_NUMBER_ID = 99999999;

const DASHBOARD_ID = ENTITY_ID;

const darkTheme = getSdkStorybookDarkTheme();

export default {
  title: "EmbeddingSDK/EditableDashboard",
  component: EditableDashboard,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    dashboardId: {
      options: [
        ENTITY_ID,
        ONE_TOO_MANY_ENTITY_ID,
        WRONG_ENTITY_ID,
        NUMBER_ID,
        WRONG_NUMBER_ID,
      ],
      control: {
        type: "select",
        labels: {
          [ENTITY_ID]: "Entity ID",
          [ONE_TOO_MANY_ENTITY_ID]: "One Too Many Entity ID",
          [WRONG_ENTITY_ID]: "Wrong Entity ID",
          [NUMBER_ID]: "Number ID",
          [WRONG_NUMBER_ID]: "Wrong Number ID",
        },
      },
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
