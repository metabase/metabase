import { CommonSdkStoryCorsWrapper } from "embedding-sdk/test/CommonSdkCorsStoryWrapper";

import { StaticDashboard } from "../SdkDashboard";

import { dashboardStoryArgTypes } from "./arg-types";
import { Default as DefaultDashboardStory } from "./dashboard.stories";
import {
  type DashboardStoryDefaultArgsProps,
  dashboardStoryDefaultArgs,
} from "./default-args";

export default {
  title: "EmbeddingSDK/dashboard/CypressStaticDashboardWithCors",
  component: StaticDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryCorsWrapper],
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
