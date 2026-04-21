import type { StoryFn } from "@storybook/react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { SdkErrorComponentProps } from "metabase/embedding/sdk-bundle/types";

import {
  DashboardNotFoundError,
  QuestionNotFoundError,
  SdkError,
} from "./SdkError";

export default {
  title: "EmbeddingSDK/SdkError",
  component: SdkError,
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<SdkErrorComponentProps> = (args) => (
  <SdkError {...args} />
);

export const Default = {
  render: Template,
  args: {
    message: "Something went wrong.",
    type: "relative",
  },
};

export const WithCloseButton = {
  render: Template,
  args: {
    message: "Something went wrong.",
    type: "relative",
    withCloseButton: true,
  },
};

export const WithDocLink = {
  render: Template,
  args: {
    message: "Something went wrong.",
    type: "relative",
    error: Object.assign(new Error("Existing user session failed."), {
      code: "EXISTING_USER_SESSION_FAILED",
    }),
  },
};

export const Fixed = {
  render: ((args) => {
    return (
      <>
        If you see nothing, refresh the page.
        <SdkError {...args} />
      </>
    );
  }) as StoryFn<SdkErrorComponentProps>,
  args: {
    message: "Something went wrong.",
    type: "fixed",
    withCloseButton: true,
  },
};

const LONG_MESSAGE =
  'Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjF9LCJwYXJhbXMiOnt9LCJleHAiOjE3NzQ2MDkyMDksImlhdCI6MTc3NDYwOTE5OX0.-S3eLFi_XZeb9ltaorP7_k52fXW_jhtb1oG-BuOVSWw"}';

export const LongMessage = {
  render: Template,
  args: {
    message: LONG_MESSAGE,
    type: "relative",
  },
};

export const QuestionNotFound = {
  render: () => <QuestionNotFoundError id={1} />,
};

export const DashboardNotFound = {
  render: () => <DashboardNotFoundError id={42} />,
};
