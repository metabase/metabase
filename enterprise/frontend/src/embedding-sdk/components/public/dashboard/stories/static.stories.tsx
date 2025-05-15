import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { StaticDashboard } from "../SdkDashboard";

import { dashboardStoryArgTypes } from "./arg-types";
import { Default as DefaultDashboardStory } from "./dashboard.stories";
import {
  type DashboardStoryDefaultArgsProps,
  dashboardStoryDefaultArgs,
} from "./default-args";

export default {
  title: "EmbeddingSDK/dashboard/StaticDashboard",
  component: StaticDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: dashboardStoryArgTypes,
};

const staticDashboardStoryArgs = (args: DashboardStoryDefaultArgsProps = {}) =>
  dashboardStoryDefaultArgs({
    ...args,
    mode: "static",
  });

export const Default = {
  render: DefaultDashboardStory,
  args: staticDashboardStoryArgs(),
};

export const WithoutFooter = {
  render: DefaultDashboardStory,
  args: staticDashboardStoryArgs({
    withFooter: false,
  }),
};
