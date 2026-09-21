import type { StoryFn } from "@storybook/react";

import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

import { Error as ErrorComponent } from "./Error";

export default {
  title: "EmbeddingSDK/Error",
  component: ErrorComponent,
  decorators: [getHostedBundleStoryDecorator()],
};

type Args = {
  message: string;
  theme: MetabaseTheme | undefined;
};

const Template: StoryFn<Args> = (args) => <ErrorComponent {...args} />;

export const Default = {
  render: Template,
  args: {
    message: "Something went wrong.",
    theme: undefined,
  },
};

const LONG_MESSAGE =
  "Something went wrong while loading this content. Please check your connection and try again, or contact your administrator if the problem persists.";

export const LongMessage = {
  render: Template,
  args: {
    message: LONG_MESSAGE,
    theme: undefined,
  },
};
