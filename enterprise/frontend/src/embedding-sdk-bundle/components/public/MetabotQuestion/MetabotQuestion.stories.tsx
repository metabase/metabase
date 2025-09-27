import type { StoryFn } from "@storybook/react";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import {
  MOCK_AD_HOC_QUESTION_ID,
  mockStreamResponse,
} from "embedding-sdk-shared/test/mocks/mock-metabot-response";
import { Flex, Stack } from "metabase/ui";

import { MetabotQuestion } from "./MetabotQuestion";

type MetabotQuestionProps = ComponentProps<typeof MetabotQuestion>;

export default {
  title: "EmbeddingSDK/MetabotQuestion",
  component: MetabotQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
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
      <Stack align="center" justify="center">
        <Flex
          m="40px"
          style={{
            border: "1px solid var(--mb-color-border)",
            borderRadius: "16px",
          }}
        >
          <MetabotQuestion height="calc(100vh - 80px)" />
        </Flex>
      </Stack>
    );
  },
};

export const RedirectReaction = {
  render: Template,
  parameters: {
    msw: {
      handlers: [
        mockStreamResponse([
          `0:"Here is the [question link](${MOCK_AD_HOC_QUESTION_ID})"`,
          `2:{"type":"navigate_to","version":1,"value":"${MOCK_AD_HOC_QUESTION_ID}"}
`,
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
        http.post("*/api/ee/metabot-v3/agent-streaming", () => {
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
      <Stack align="center" justify="center">
        <Flex
          m="40px"
          style={{
            border: "1px solid var(--mb-color-border)",
            borderRadius: "16px",
          }}
        >
          <MetabotQuestion height="calc(100vh - 80px)" layout="sidebar" />
        </Flex>
      </Stack>
    );
  },
};

export const StackedLayout = {
  render() {
    return (
      <Stack align="center" justify="center">
        <Flex
          m="40px"
          style={{
            border: "1px solid var(--mb-color-border)",
            borderRadius: "16px",
          }}
        >
          <MetabotQuestion height="calc(100vh - 80px)" layout="stacked" />
        </Flex>
      </Stack>
    );
  },
};
