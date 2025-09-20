import type { StoryFn } from "@storybook/react";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import {
  MOCK_AD_HOC_QUESTION_ID,
  mockStreamResponse,
} from "embedding-sdk-shared/test/mocks/mock-metabot-response";
import { Box } from "metabase/ui";

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
  return (
    <Box
      bg="var(--mb-color-background)"
      mih="100vh"
      bd="1px solid #000"
      pt="2rem"
    >
      <MetabotQuestion />
    </Box>
  );
};

export const Default = {
  render: Template,
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
