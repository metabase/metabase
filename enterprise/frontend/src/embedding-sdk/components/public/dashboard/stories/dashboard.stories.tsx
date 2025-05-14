import type { Meta, StoryObj } from "@storybook/react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { dashboardIds } from "embedding-sdk/test/storybook-id-args";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

import { dashboardStoryArgTypes } from "./arg-types";
import {
  MockDrillThroughQuestion,
  dashboardStoryDefaultArgs,
} from "./default-args";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

/**
 * The SdkDashboard component provides a configurable dashboard experience.
 */
const meta: Meta<SdkDashboardProps> = {
  title: "Components/SdkDashboard",
  component: SdkDashboard,
  decorators: [CommonSdkStoryWrapper],
  argTypes: dashboardStoryArgTypes,
};

export default meta;

/**
 * Example of the SdkDashboard component with controls.
 */
export const Dashboard: StoryObj<
  SdkDashboardProps & { useCustomDrillThrough: boolean }
> = {
  args: dashboardStoryDefaultArgs(DASHBOARD_ID),
  render: (args) => {
    const { useCustomDrillThrough, ...restArgs } = args;
    return (
      <SdkDashboard
        {...restArgs}
        renderDrillThroughQuestion={
          useCustomDrillThrough ? MockDrillThroughQuestion : undefined
        }
      />
    );
  },
};
