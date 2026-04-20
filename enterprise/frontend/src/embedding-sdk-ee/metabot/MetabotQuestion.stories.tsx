import type { StoryFn } from "@storybook/react";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { MetabotQuestion } from "embedding-sdk-package";
import { MetabaseProvider } from "embedding-sdk-package/components/public/MetabaseProvider";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";
import {
  MOCK_AD_HOC_QUESTION_ID,
  mockStreamResponse,
} from "embedding-sdk-shared/test/mocks/mock-metabot-response";
import { Flex, Stack } from "metabase/ui";

// side effect to activate the plugin
import "./MetabotQuestion";

type MetabotQuestionProps = ComponentProps<typeof MetabotQuestion>;

const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/MetabotQuestion",
  component: MetabotQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story: StoryFn) => (
      <MetabaseProvider authConfig={config}>
        <Story />
      </MetabaseProvider>
    ),
    getHostedBundleStoryDecorator(),
  ],
};

const Template: StoryFn<MetabotQuestionProps> = () => {
  return <MetabotQuestion height="100vh" />;
};

export const FullWidth = {
  render: Template,
};

export const Centered = {
  render() {
    return (
      <CenteredLayoutPreview>
        <MetabotQuestion height="calc(100vh - 90px)" />
      </CenteredLayoutPreview>
    );
  },
};

export const RedirectReaction = {
  render: Template,
  parameters: {
    msw: {
      handlers: [
        mockStreamResponse([
          { type: "text-start", id: "t1" },
          {
            type: "text-delta",
            id: "t1",
            delta: `Here is the [question link](${MOCK_AD_HOC_QUESTION_ID})`,
          },
          { type: "text-end", id: "t1" },
          { type: "data-navigate_to", id: "d1", data: MOCK_AD_HOC_QUESTION_ID },
        ]),
      ],
    },
  },
};

export const MetabotError = {
  render: Template,
  parameters: {
    msw: {
      handlers: [
        http.post("*/api/metabot/agent-streaming", () => {
          return new HttpResponse(null, {
            status: 500,
          });
        }),
      ],
    },
  },
};

export const MultipleInstances = {
  render: () => (
    <>
      <Template />
      <Template />
    </>
  ),
};

export const SidebarLayout = {
  render() {
    return (
      <CenteredLayoutPreview>
        <MetabotQuestion height="calc(100vh - 90px)" layout="sidebar" />
      </CenteredLayoutPreview>
    );
  },
};

export const StackedLayout = {
  render() {
    return (
      <CenteredLayoutPreview>
        <MetabotQuestion height="calc(100vh - 90px)" layout="stacked" />
      </CenteredLayoutPreview>
    );
  },
};

const CenteredLayoutPreview = ({ children }: { children: React.ReactNode }) => (
  <Stack align="center" justify="center">
    <Flex
      m="40px"
      bg="background-primary"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "16px",
      }}
    >
      {children}
    </Flex>
  </Stack>
);
