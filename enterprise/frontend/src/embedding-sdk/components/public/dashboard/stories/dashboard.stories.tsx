import type { Meta, StoryFn } from "@storybook/react";
import { useMemo } from "react";

import {
  CommonSdkStoryWrapper,
  getStorybookSdkAuthConfigForUser,
} from "embedding-sdk/test/CommonSdkStoryWrapper";
import { storybookThemes } from "embedding-sdk/test/storybook-themes";

import {
  MetabaseProvider,
  type MetabaseProviderProps,
} from "../../MetabaseProvider";
import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

import { dashboardStoryArgTypes } from "./arg-types";
import {
  MockDrillThroughQuestion,
  dashboardStoryDefaultArgs,
} from "./default-args";

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

export const Default: StoryFn<
  SdkDashboardProps & { useCustomDrillThrough: boolean } & Pick<
      MetabaseProviderProps,
      "theme"
    >
> = (args, context) => {
  const { useCustomDrillThrough, theme, ...restArgs } = args;
  const sdkTheme = context.globals.sdkTheme;
  const storybookTheme = sdkTheme ? storybookThemes[sdkTheme] : undefined;
  const locale = context.globals.locale;
  const user = context.globals.user;

  const key = `${user}-${locale}`;

  const authConfig = useMemo(() => {
    return getStorybookSdkAuthConfigForUser(user);
  }, [user]);

  return (
    <MetabaseProvider
      authConfig={authConfig}
      key={key}
      theme={theme ?? storybookTheme}
      locale={locale}
    >
      <SdkDashboard
        {...restArgs}
        renderDrillThroughQuestion={
          useCustomDrillThrough ? MockDrillThroughQuestion : undefined
        }
      />
    </MetabaseProvider>
  );
};

Default.args = dashboardStoryDefaultArgs();
