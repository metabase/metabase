import { defineMetabaseTheme } from "embedding-sdk";
import { storybookThemes } from "embedding-sdk/test/storybook-themes";

import { EditableDashboard } from "../SdkDashboard";

import { dashboardStoryArgTypes } from "./arg-types";
import { Default as DefaultDashboardStory } from "./dashboard.stories";
import {
  type DashboardStoryDefaultArgsProps,
  dashboardStoryDefaultArgs,
} from "./default-args";

const darkTheme = storybookThemes.dark;

export default {
  title: "EmbeddingSDK/dashboard/EditableDashboard",
  component: EditableDashboard,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: dashboardStoryArgTypes,
};

const editableDashboardDefaultArgs = (
  args: DashboardStoryDefaultArgsProps = {},
) => dashboardStoryDefaultArgs({ mode: "editable", ...args });

export const Default = {
  args: editableDashboardDefaultArgs(),
  render: DefaultDashboardStory,
};

export const WithCustomGridColor = {
  args: {
    ...editableDashboardDefaultArgs(),
    theme: defineMetabaseTheme({
      components: { dashboard: { gridBorderColor: "#95A5A6" } },
    }),
  },
  render: DefaultDashboardStory,
};

export const WithDarkTheme = {
  args: {
    ...editableDashboardDefaultArgs(),
    theme: darkTheme,
  },
  render: DefaultDashboardStory,
};
