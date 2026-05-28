import type { StoryFn } from "@storybook/react";
import type { JSXElementConstructor } from "react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { SdkQuestionId } from "embedding-sdk-bundle/types";
import { MetabaseProvider } from "embedding-sdk-package/components/public/MetabaseProvider";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";
import { Box, Button, Code, Group, Stack, Text } from "metabase/ui";

import { useQuestionQuery } from "./use-question-query";

const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/use-question-query",
  decorators: [getHostedBundleStoryDecorator()],
  argTypes: {
    questionId: {
      control: "text",
    },
  },
  args: {
    questionId: QUESTION_ID,
  },
};

type HookStoryArgs = {
  questionId: SdkQuestionId | string;
};

const QuestionQueryResult = ({ questionId }: HookStoryArgs) => {
  const normalizedQuestionId = normalizeQuestionId(questionId);
  const { data, isLoading, error, refetch } =
    useQuestionQuery(normalizedQuestionId);

  const serializedError = serializeError(error);
  const previewData = data && {
    ...data,
    rows: data.rows.slice(0, 5),
  };

  return (
    <Box p="xl">
      <Stack gap="md">
        <Group>
          <Button onClick={refetch} loading={isLoading}>
            Refetch
          </Button>
          <Text c={error ? "error" : undefined}>
            {error
              ? "Error"
              : isLoading
                ? "Loading"
                : `Ready: question ${normalizedQuestionId}`}
          </Text>
        </Group>

        {error ? (
          <Stack gap="xs">
            <Text fw={700}>Error</Text>
            <Code block>{JSON.stringify(serializedError, null, 2)}</Code>
          </Stack>
        ) : null}

        <Stack gap="xs">
          <Text fw={700}>Flattened result</Text>
          <Code block>{JSON.stringify(previewData, null, 2)}</Code>
        </Stack>
      </Stack>
    </Box>
  );
};

function normalizeQuestionId(
  questionId: SdkQuestionId | string,
): SdkQuestionId {
  if (typeof questionId === "string" && /^\d+$/.test(questionId)) {
    return Number(questionId);
  }

  return questionId as SdkQuestionId;
}

function serializeError(error: unknown) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "object") {
    return error;
  }

  return String(error);
}

const HookTemplate: StoryFn<JSXElementConstructor<HookStoryArgs>> = (args) => (
  <MetabaseProvider authConfig={config}>
    <QuestionQueryResult {...args} />
  </MetabaseProvider>
);

export const Default = {
  args: {
    questionId: "161",
  },
  render: HookTemplate,
};
