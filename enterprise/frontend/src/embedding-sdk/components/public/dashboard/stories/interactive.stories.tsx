import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { InteractiveDashboard } from "../SdkDashboard";

import { dashboardStoryArgTypes } from "./arg-types";
import { Default as DefaultDashboardStory } from "./dashboard.stories";
import {
  type DashboardStoryDefaultArgsProps,
  dashboardStoryDefaultArgs,
} from "./default-args";

export default {
  title: "EmbeddingSDK/dashboard/InteractiveDashboard",
  component: InteractiveDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: dashboardStoryArgTypes,
};

const interactiveDashboardStoryArgs = (
  args: DashboardStoryDefaultArgsProps = {},
) => dashboardStoryDefaultArgs({ ...args, mode: "interactive" });

export const Default = {
  render: DefaultDashboardStory,
  args: interactiveDashboardStoryArgs(),
};

export const WithCustomQuestionLayout = {
  render: Default,
  args: interactiveDashboardStoryArgs({
    useCustomDrillThrough: true,
  }),
};
